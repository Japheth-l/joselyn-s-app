import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { requireAdmin } from "./authz";
import { invalid } from "./errors";

// Platform fees and rules. Defaults live here; administrators can override any value (stored in PlatformSetting).
export const DEFAULT_SETTINGS = {
  /** Commission kept from the business's sewing + fabric amount. */
  commissionBps: 1000,
  /** Service fee shown to the customer on each quotation. */
  serviceFeeBps: 250,
  serviceFeeCapMinor: 2000,
  /** Share of the total a quotation asks for before production starts. */
  depositBps: 5000,
  homeMeasurementFeeMinor: 3000,
  deliveryBaseMinor: 1500,
  deliveryPerKmMinor: 300,
  quoteValidityDays: 7,
  /** Unpaid fabric reservations are released after this many hours. */
  reservationHours: 72,
  searchRadiusKm: 25,
  /** Orders auto-complete this many days after delivery/collection if the customer does nothing. */
  autoCompleteDays: 7,
  /** Reviews can be left this many days after completion. */
  reviewWindowDays: 60,
} as const;
export type Settings = { -readonly [K in keyof typeof DEFAULT_SETTINGS]: number };
export type SettingKey = keyof Settings;

export const SETTING_LABELS: Record<SettingKey, string> = {
  commissionBps: "Commission on sewing and fabric (basis points, 1000 = 10%)",
  serviceFeeBps: "Customer service fee (basis points)",
  serviceFeeCapMinor: "Service fee cap (pesewas)",
  depositBps: "Default deposit (basis points)",
  homeMeasurementFeeMinor: "Default home measurement fee (pesewas)",
  deliveryBaseMinor: "Delivery base fee (pesewas)",
  deliveryPerKmMinor: "Delivery fee per km (pesewas)",
  quoteValidityDays: "Quotations valid for (days)",
  reservationHours: "Unpaid fabric reservations last (hours)",
  searchRadiusKm: "Default search radius (km)",
  autoCompleteDays: "Auto-complete after handover (days)",
  reviewWindowDays: "Reviews allowed for (days after completion)",
};

export async function getSettings(): Promise<Settings> {
  const rows = await db.platformSetting.findMany();
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in s && typeof r.value === "number") s[r.key as SettingKey] = r.value;
  }
  return s;
}

export async function updateSetting(actor: Actor, key: string, value: number) {
  requireAdmin(actor, "CONFIG");
  if (!(key in DEFAULT_SETTINGS)) throw invalid("Unknown setting.");
  if (!Number.isInteger(value) || value < 0 || value > 10_000_000) throw invalid("Enter a whole number that is zero or more.");
  if (key.endsWith("Bps") && value > 10_000) throw invalid("Basis points cannot exceed 10000 (100%).");
  const before = await db.platformSetting.findUnique({ where: { key } });
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: value as Prisma.InputJsonValue, updatedById: actor.userId },
    update: { value: value as Prisma.InputJsonValue, updatedById: actor.userId },
  });
  await audit(actor.userId, "settings.update", { type: "PlatformSetting", id: key }, { from: before?.value ?? (DEFAULT_SETTINGS as Record<string, number>)[key], to: value });
}
