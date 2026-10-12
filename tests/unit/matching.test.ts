import { describe, expect, it } from "vitest";
import { matchTailors, type MatchCandidate, type MatchRequest } from "@/server/matching";

const now = new Date("2026-10-01T09:00:00Z");
const base: MatchCandidate = {
  businessId: "b", name: "Base", lat: 5.6037, lng: -0.187, serviceRadiusKm: 15, verified: true, offersStyle: true,
  labourMinor: 20000, daysToMake: 7, fabricMinor: 15000, openOrders: 0, capacityPerWeek: 10,
  rating: 0, reviewCount: 0, completedOrders: 0, offersWorkshopFitting: true,
};
const req: MatchRequest = {
  lat: 5.6037, lng: -0.187, budgetMinor: 50000, neededBy: null, now, fabricSource: "BUSINESS", remoteService: false,
  measurementFeeMinor: 0, searchRadiusKm: 25, fees: { serviceFeeBps: 250, serviceFeeCapMinor: 2000 },
};
const c = (over: Partial<MatchCandidate>): MatchCandidate => ({ ...base, ...over });

describe("tailor matching", () => {
  it("applies hard filters with explained exclusions", () => {
    const out = matchTailors([
      c({ businessId: "unverified", verified: false }),
      c({ businessId: "nostyle", offersStyle: false }),
      c({ businessId: "far", lat: 6.7, lng: -1.6 }), // Kumasi
      c({ businessId: "nofabric", fabricMinor: null }),
      c({ businessId: "ok" }),
    ], req);
    expect(out.results.map((r) => r.businessId)).toEqual(["ok"]);
    expect(Object.fromEntries(out.excluded.map((e) => [e.businessId, e.code]))).toEqual({
      unverified: "UNVERIFIED", nostyle: "STYLE", far: "DISTANCE", nofabric: "FABRIC",
    });
  });

  it("doesn't require stock when the customer brings fabric", () => {
    const out = matchTailors([c({ fabricMinor: null })], { ...req, fabricSource: "OWN" });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].breakdown.fabricMinor).toBe(0);
  });

  it("excludes businesses that can't meet the deadline, using their real queue", () => {
    const neededBy = new Date("2026-10-12T00:00:00Z");
    const out = matchTailors([c({ businessId: "free" }), c({ businessId: "busy", openOrders: 20, capacityPerWeek: 5 })], { ...req, neededBy });
    expect(out.results.map((r) => r.businessId)).toEqual(["free"]);
    expect(out.excluded[0]).toMatchObject({ businessId: "busy", code: "DEADLINE" });
    expect(out.suggestions.join(" ")).toMatch(/later completion date/);
  });

  it("respects service area only when someone must travel to the customer", () => {
    const near = c({ lat: 5.7, lng: -0.187, serviceRadiusKm: 5 }); // ~10.7 km away
    expect(matchTailors([near], req).results).toHaveLength(1);
    const out = matchTailors([near], { ...req, remoteService: true, measurementFeeMinor: 3000 });
    expect(out.excluded[0].code).toBe("SERVICE_AREA");
    expect(out.suggestions.join(" ")).toMatch(/workshop/);
  });

  it("puts in-budget results first and suggests options when nothing fits", () => {
    const out = matchTailors([c({ businessId: "pricey", labourMinor: 90000 }), c({ businessId: "cheap", labourMinor: 10000 })], req);
    expect(out.results[0].businessId).toBe("cheap");
    expect(out.results[0].withinBudget).toBe(true);
    expect(out.results[1].withinBudget).toBe(false);

    const none = matchTailors([c({ labourMinor: 90000 })], { ...req, budgetMinor: 1000 });
    expect(none.results[0].withinBudget).toBe(false);
    expect(none.suggestions[0]).toMatch(/lowest estimate/);
  });

  it("never invents ratings or prices", () => {
    const out = matchTailors([c({ labourMinor: null, reviewCount: 0, rating: 0 })], req);
    const r = out.results[0];
    expect(r.estimateMinor).toBeNull();
    expect(r.withinBudget).toBeNull();
    expect(r.cautions).toContain("No reviews yet");
    expect(r.cautions.join(" ")).toMatch(/No listed price/);
    expect(r.reasons.join(" ")).not.toMatch(/★/);
  });

  it("estimate = labour + fabric + measurement + capped service fee", () => {
    const out = matchTailors([c({})], { ...req, measurementFeeMinor: 3000 });
    const r = out.results[0];
    const subtotal = 20000 + 15000 + 3000;
    expect(r.estimateMinor).toBe(subtotal + Math.min(Math.floor((subtotal * 250 + 5000) / 10000), 2000));
  });

  it("is deterministic and scores within 0–100", () => {
    const cands = [c({ businessId: "a", rating: 4.8, reviewCount: 30, completedOrders: 80 }), c({ businessId: "b", lat: 5.65 })];
    const a = matchTailors(cands, req);
    const b = matchTailors(cands, req);
    expect(a).toEqual(b);
    for (const r of a.results) expect(r.score).toBeGreaterThanOrEqual(0), expect(r.score).toBeLessThanOrEqual(100);
    expect(a.results[0].businessId).toBe("a");
  });
});
