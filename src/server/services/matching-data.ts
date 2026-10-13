import { db } from "@/lib/db";
import { SEWING_KINDS } from "@/lib/enums";
import { boundingBox } from "@/lib/geo";
import { priceForQty } from "@/lib/qty";
import { notFound } from "../errors";
import { matchTailors, type MatchCandidate } from "../matching";
import { OPEN_STATUSES } from "../order-machine";
import { getSettings } from "../settings";

export type FindTailorsInput = {
  styleId: string;
  lat: number;
  lng: number;
  budgetMinor: number | null;
  neededBy: Date | null;
  fabricSource: "OWN" | "BUSINESS" | "SELLER";
  fabricType?: string | null;
  measurementMethod: "SAVED" | "SELF" | "HOME_VISIT" | "AT_WORKSHOP";
  radiusKm?: number;
};

/**
 * Builds match candidates from real records only: listed prices, actual stock, open-order counts,
 * published reviews and completed orders. Nothing is estimated that the data doesn't support.
 */
export async function findTailors(input: FindTailorsInput, now = new Date()) {
  const settings = await getSettings();
  const style = await db.style.findFirst({ where: { id: input.styleId, status: "PUBLISHED" } });
  if (!style) throw notFound("Style");
  const radius = Math.min(100, Math.max(1, input.radiusKm ?? settings.searchRadiusKm));
  // Look a little beyond the radius so the customer can be told about businesses just outside it.
  const box = boundingBox(input.lat, input.lng, radius * 1.5);
  const needQty = style.fabricQtyCenti;

  const businesses = await db.business.findMany({
    where: {
      kinds: { hasSome: SEWING_KINDS },
      verificationStatus: { in: ["VERIFIED", "PENDING"] },
      lat: { gte: box.minLat, lte: box.maxLat },
      lng: { gte: box.minLng, lte: box.maxLng },
    },
    include: {
      styles: { where: { styleId: style.id } },
      materials: input.fabricSource === "BUSINESS"
        ? { where: { status: "ACTIVE", ...(input.fabricType ? { fabricType: input.fabricType } : {}) } }
        : false,
    },
    take: 200,
  });

  const openCounts = await db.order.groupBy({
    by: ["businessId"],
    where: { businessId: { in: businesses.map((b) => b.id) }, kind: "CUSTOM", status: { in: OPEN_STATUSES } },
    _count: true,
  });
  const open = new Map(openCounts.map((r) => [r.businessId, r._count]));

  const candidates: MatchCandidate[] = businesses.map((b) => {
    const offer = b.styles[0];
    const fabrics = "materials" in b && Array.isArray(b.materials) ? b.materials : [];
    const suitable = fabrics.filter((f) => f.qtyOnHandCenti - f.qtyReservedCenti >= needQty);
    const cheapest = suitable.length ? Math.min(...suitable.map((f) => priceForQty(f.pricePerUnitMinor, needQty))) : null;
    return {
      businessId: b.id,
      name: b.name,
      lat: b.lat,
      lng: b.lng,
      serviceRadiusKm: b.serviceRadiusKm,
      verified: b.verificationStatus === "VERIFIED",
      offersStyle: !!offer,
      labourMinor: offer?.priceMinor ?? null,
      daysToMake: offer?.daysToMake ?? 7,
      fabricMinor: cheapest,
      openOrders: open.get(b.id) ?? 0,
      capacityPerWeek: b.capacityPerWeek,
      rating: b.rating,
      reviewCount: b.reviewCount,
      completedOrders: b.completedOrders,
      offersWorkshopFitting: b.offersWorkshopFitting,
    };
  });

  const homeVisit = input.measurementMethod === "HOME_VISIT";
  const out = matchTailors(candidates, {
    lat: input.lat,
    lng: input.lng,
    budgetMinor: input.budgetMinor,
    neededBy: input.neededBy,
    now,
    fabricSource: input.fabricSource,
    remoteService: homeVisit,
    measurementFeeMinor: homeVisit ? settings.homeMeasurementFeeMinor : 0,
    searchRadiusKm: radius,
    fees: { serviceFeeBps: settings.serviceFeeBps, serviceFeeCapMinor: settings.serviceFeeCapMinor },
  });
  // Unverified businesses are not shown to customers by name.
  return { ...out, excluded: out.excluded.filter((e) => e.code !== "UNVERIFIED"), style, radiusKm: radius };
}
