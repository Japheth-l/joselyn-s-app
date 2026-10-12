// Budget-aware tailor matching. Pure functions only (no database), so the scoring can be tested and tuned.
//
// 1. Hard filters remove businesses that can't do the job (style not offered, not verified, no suitable
//    fabric when the customer wants the business's fabric, outside the search radius or service area,
//    can't finish before the deadline). Excluded businesses are returned with the reason so the customer
//    can be told how to widen the search.
// 2. Each remaining business gets an estimate and a 0–100 score from the factors that have real data.
//    A factor with no data (no reviews, no price, no deadline) is left out instead of guessed.
// 3. Every result carries plain-language reasons and cautions.

import { formatMoney } from "@/lib/money";
import { formatDate, addDays, daysBetween } from "@/lib/time";
import { distanceKm, roundKm } from "@/lib/geo";
import { serviceFeeMinor } from "./pricing";

export type MatchCandidate = {
  businessId: string;
  name: string;
  lat: number;
  lng: number;
  serviceRadiusKm: number;
  verified: boolean;
  offersStyle: boolean;
  labourMinor: number | null; // indicative price; null = price on request
  daysToMake: number;
  /** Cheapest suitable fabric this business has in stock, priced for the required quantity. */
  fabricMinor: number | null;
  openOrders: number;
  capacityPerWeek: number;
  rating: number;
  reviewCount: number;
  completedOrders: number;
  offersWorkshopFitting: boolean;
};

export type MatchRequest = {
  lat: number;
  lng: number;
  budgetMinor: number | null;
  neededBy: Date | null;
  now: Date;
  fabricSource: "OWN" | "BUSINESS" | "SELLER";
  /** True when someone must travel to the customer (home measurement). */
  remoteService: boolean;
  measurementFeeMinor: number;
  searchRadiusKm: number;
  fees: { serviceFeeBps: number; serviceFeeCapMinor: number };
};

export type MatchResult = {
  businessId: string;
  name: string;
  score: number;
  distanceKm: number;
  estimateMinor: number | null;
  breakdown: { labourMinor: number | null; fabricMinor: number; measurementMinor: number; serviceFeeMinor: number };
  withinBudget: boolean | null;
  earliestCompletion: Date;
  meetsDeadline: boolean | null;
  reasons: string[];
  cautions: string[];
};

export type Exclusion = { businessId: string; name: string; reason: string; code: "STYLE" | "UNVERIFIED" | "FABRIC" | "DISTANCE" | "SERVICE_AREA" | "DEADLINE" };

export type MatchOutput = { results: MatchResult[]; excluded: Exclusion[]; suggestions: string[] };

const WEIGHTS = { price: 35, distance: 25, deadline: 15, reviews: 15, reliability: 10 };

export function earliestCompletion(c: Pick<MatchCandidate, "openOrders" | "capacityPerWeek" | "daysToMake">, now: Date) {
  const queueDays = c.capacityPerWeek > 0 ? Math.ceil((c.openOrders / c.capacityPerWeek) * 7) : 28;
  return addDays(now, queueDays + c.daysToMake);
}

export function matchTailors(candidates: MatchCandidate[], req: MatchRequest): MatchOutput {
  const results: MatchResult[] = [];
  const excluded: Exclusion[] = [];

  for (const c of candidates) {
    const ex = (code: Exclusion["code"], reason: string) => excluded.push({ businessId: c.businessId, name: c.name, code, reason });
    if (!c.verified) { ex("UNVERIFIED", "Not verified yet"); continue; }
    if (!c.offersStyle) { ex("STYLE", "Doesn't sew this style"); continue; }
    const km = roundKm(distanceKm(req.lat, req.lng, c.lat, c.lng));
    if (km > req.searchRadiusKm) { ex("DISTANCE", `${km} km away, outside your ${req.searchRadiusKm} km search`); continue; }
    if (req.remoteService && km > c.serviceRadiusKm) { ex("SERVICE_AREA", `Serves up to ${c.serviceRadiusKm} km; you are ${km} km away`); continue; }
    if (req.fabricSource === "BUSINESS" && c.fabricMinor == null) { ex("FABRIC", "No suitable fabric in stock"); continue; }
    const done = earliestCompletion(c, req.now);
    const meetsDeadline = req.neededBy ? done.getTime() <= req.neededBy.getTime() : null;
    if (meetsDeadline === false) { ex("DEADLINE", `Earliest finish ${formatDate(done)}, after your date`); continue; }

    const fabricMinor = req.fabricSource === "BUSINESS" ? c.fabricMinor ?? 0 : 0;
    const subtotal = c.labourMinor == null ? null : c.labourMinor + fabricMinor + req.measurementFeeMinor;
    const fee = subtotal == null ? 0 : serviceFeeMinor(subtotal, req.fees);
    const estimate = subtotal == null ? null : subtotal + fee;
    const withinBudget = estimate == null || req.budgetMinor == null ? null : estimate <= req.budgetMinor;

    const reasons: string[] = [];
    const cautions: string[] = [];
    const factors: { w: number; v: number }[] = [];

    if (estimate != null && req.budgetMinor != null) {
      const ratio = estimate / req.budgetMinor;
      factors.push({ w: WEIGHTS.price, v: ratio <= 1 ? 0.6 + 0.4 * (1 - ratio) : Math.max(0, 0.5 - (ratio - 1)) });
      if (withinBudget) reasons.push(`Estimated ${formatMoney(estimate)}, within your ${formatMoney(req.budgetMinor)} budget`);
      else cautions.push(`Estimated ${formatMoney(estimate)}, ${formatMoney(estimate - req.budgetMinor)} over your budget`);
    } else if (estimate != null) {
      reasons.push(`Estimated ${formatMoney(estimate)}`);
    } else {
      cautions.push("No listed price for this style. Request a quote to find out");
    }

    factors.push({ w: WEIGHTS.distance, v: Math.max(0, 1 - km / Math.max(1, req.searchRadiusKm)) });
    reasons.push(`${km} km from you`);

    if (req.neededBy) {
      const slack = daysBetween(done, req.neededBy);
      factors.push({ w: WEIGHTS.deadline, v: Math.min(1, slack / 14) });
      reasons.push(`Could finish by ${formatDate(done)}${slack > 0 ? `, ${slack} day${slack === 1 ? "" : "s"} before you need it` : ""}`);
    } else {
      reasons.push(`Usually ready in about ${daysBetween(req.now, done)} days`);
    }

    if (c.reviewCount > 0) {
      const bayes = (c.rating * c.reviewCount + 3.5 * 3) / (c.reviewCount + 3);
      factors.push({ w: WEIGHTS.reviews, v: (bayes - 1) / 4 });
      reasons.push(`${c.rating.toFixed(1)}★ from ${c.reviewCount} verified review${c.reviewCount === 1 ? "" : "s"}`);
    } else {
      cautions.push("No reviews yet");
    }

    if (c.completedOrders > 0) {
      factors.push({ w: WEIGHTS.reliability, v: Math.min(1, Math.log10(1 + c.completedOrders) / 2) });
      reasons.push(`${c.completedOrders} completed order${c.completedOrders === 1 ? "" : "s"} on the platform`);
    }

    const wSum = factors.reduce((t, f) => t + f.w, 0);
    const score = Math.round((factors.reduce((t, f) => t + f.w * f.v, 0) / wSum) * 100);

    results.push({
      businessId: c.businessId, name: c.name, score, distanceKm: km, estimateMinor: estimate,
      breakdown: { labourMinor: c.labourMinor, fabricMinor, measurementMinor: req.measurementFeeMinor, serviceFeeMinor: fee },
      withinBudget, earliestCompletion: done, meetsDeadline, reasons, cautions,
    });
  }

  // In-budget (or unknown) first, then by score, then nearest.
  results.sort((a, b) =>
    Number(b.withinBudget !== false) - Number(a.withinBudget !== false) || b.score - a.score || a.distanceKm - b.distanceKm);

  return { results, excluded, suggestions: suggestions(results, excluded, req) };
}

function suggestions(results: MatchResult[], excluded: Exclusion[], req: MatchRequest): string[] {
  const out: string[] = [];
  const inBudget = results.filter((r) => r.withinBudget !== false);
  if (req.budgetMinor != null && results.length > 0 && inBudget.length === 0) {
    const cheapest = Math.min(...results.map((r) => r.estimateMinor ?? Infinity));
    if (Number.isFinite(cheapest)) out.push(`The lowest estimate is ${formatMoney(cheapest)}. Raising your budget to that amount would give you options.`);
    if (req.fabricSource === "BUSINESS") out.push("Bringing your own fabric, or buying it from a fabric seller, lowers the price.");
    if (req.measurementFeeMinor > 0) out.push(`Getting measured at the workshop instead of at home saves ${formatMoney(req.measurementFeeMinor)}.`);
    out.push("A simpler style or fewer embellishments usually costs less. You can also request quotes; businesses may offer a lower price.");
  }
  const late = excluded.filter((e) => e.code === "DEADLINE").length;
  if (late > 0) out.push(`${late} more business${late === 1 ? "" : "es"} could take this order with a later completion date.`);
  const far = excluded.filter((e) => e.code === "DISTANCE").length;
  if (far > 0 && results.length < 3) out.push(`${far} more business${far === 1 ? " is" : "es are"} a little further away. Increase the search distance to include them.`);
  const area = excluded.filter((e) => e.code === "SERVICE_AREA").length;
  if (area > 0) out.push(`${area} business${area === 1 ? "" : "es"} could serve you if you go to the workshop to be measured.`);
  const fabric = excluded.filter((e) => e.code === "FABRIC").length;
  if (fabric > 0) out.push(`${fabric} business${fabric === 1 ? "" : "es"} sew this style but don't stock that fabric. Bring your own fabric or buy it from a fabric seller.`);
  if (results.length === 0 && out.length === 0) out.push("No verified business offers this style near you yet. Try another style or a larger search distance.");
  return out;
}
