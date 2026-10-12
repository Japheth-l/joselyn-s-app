"use server";

import { z } from "zod";
import { currentActor } from "@/server/auth";
import { AppError } from "@/server/errors";
import { parseCedis } from "@/lib/money";
import { parseLocalDate } from "@/lib/time";
import { rateLimit } from "@/server/rate-limit";
import { findTailors } from "@/server/services/matching-data";

const input = z.object({
  styleId: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  budget: z.string().optional(),
  neededBy: z.string().optional(),
  fabricSource: z.enum(["OWN", "BUSINESS", "SELLER"]),
  fabricType: z.string().optional(),
  measurementMethod: z.enum(["SAVED", "SELF", "HOME_VISIT", "AT_WORKSHOP"]),
  radiusKm: z.number().int().min(1).max(100).optional(),
});

export type MatchView = {
  results: {
    businessId: string; name: string; slug: string; isDemo: boolean; score: number; distanceKm: number; estimateMinor: number | null;
    breakdown: { labourMinor: number | null; fabricMinor: number; measurementMinor: number; serviceFeeMinor: number };
    withinBudget: boolean | null; earliestCompletion: string; meetsDeadline: boolean | null; reasons: string[]; cautions: string[];
  }[];
  excluded: { businessId: string; name: string; reason: string }[];
  suggestions: string[];
  radiusKm: number;
  error?: string;
};

/** Tailor matching for the order wizard. Results are computed from real records only. */
export async function findTailorsAction(raw: z.input<typeof input>): Promise<MatchView> {
  const empty = { results: [], excluded: [], suggestions: [], radiusKm: 0 };
  try {
    const actor = await currentActor();
    if (!actor) return { ...empty, error: "Please log in again." };
    await rateLimit(`match:${actor.userId}`, 60, 600);
    const d = input.parse(raw);
    const budgetMinor = d.budget ? parseCedis(d.budget) : null;
    if (d.budget && budgetMinor == null) return { ...empty, error: "Enter your budget in cedis, e.g. 350." };
    const out = await findTailors({
      styleId: d.styleId, lat: d.lat, lng: d.lng, budgetMinor, neededBy: d.neededBy ? parseLocalDate(d.neededBy) : null,
      fabricSource: d.fabricSource, fabricType: d.fabricType || null, measurementMethod: d.measurementMethod, radiusKm: d.radiusKm,
    });
    const { db } = await import("@/lib/db");
    const meta = await db.business.findMany({ where: { id: { in: out.results.map((r) => r.businessId) } }, select: { id: true, slug: true, isDemo: true } });
    const byId = new Map(meta.map((m) => [m.id, m]));
    return {
      results: out.results.map((r) => ({ ...r, slug: byId.get(r.businessId)?.slug ?? "", isDemo: byId.get(r.businessId)?.isDemo ?? false, earliestCompletion: r.earliestCompletion.toISOString() })),
      excluded: out.excluded.map((e) => ({ businessId: e.businessId, name: e.name, reason: e.reason })),
      suggestions: out.suggestions,
      radiusKm: out.radiusKm,
    };
  } catch (e) {
    if (e instanceof AppError) return { ...empty, error: e.message };
    if (e instanceof z.ZodError) return { ...empty, error: "Please complete the earlier steps first." };
    return { ...empty, error: "We couldn't search right now. Please try again." };
  }
}
