import "server-only";
import { db } from "./db";
import { SEARCH_RADIUS_KM } from "./constants";
import { distanceKm } from "./geo";

export type Recommendation = {
  businessId: string;
  name: string;
  kind: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  rating: number;
  reviewCount: number;
  distanceKm: number;
  laborPrice: number;
  daysToMake: number;
  fabricPrice: number; // cheapest matching fabric for the style's yardage (0 if client brings their own)
  estimate: number;
  withinBudget: boolean;
  materials: { id: string; name: string; design: string; color: string; pricePerYard: number; imageUrl: string | null }[];
};

/**
 * Verified tailors that sew the chosen style and stock the chosen fabric design,
 * cheapest-within-budget first, then nearest.
 */
export async function recommendTailors(input: {
  styleId: string;
  design: string; // a FabricDesign key, or "OWN" when the client brings fabric
  budget: number;
  lat: number;
  lng: number;
}): Promise<{ yardsNeeded: number; results: Recommendation[]; widened: boolean }> {
  const style = await db.style.findUniqueOrThrow({ where: { id: input.styleId } });
  const offers = await db.businessStyle.findMany({
    where: { styleId: style.id, business: { verificationStatus: "VERIFIED" } },
    include: {
      business: {
        include: {
          materials: input.design === "OWN"
            ? { where: { id: "__none__" } }
            : { where: { design: input.design, yardsInStock: { gte: style.yardsNeeded } }, orderBy: { pricePerYard: "asc" } },
        },
      },
    },
  });

  const all: Recommendation[] = [];
  for (const o of offers) {
    const b = o.business;
    const ownFabric = input.design === "OWN";
    if (!ownFabric && b.materials.length === 0) continue;
    const fabricPrice = ownFabric ? 0 : Math.round(b.materials[0].pricePerYard * style.yardsNeeded);
    const estimate = o.price + fabricPrice;
    all.push({
      businessId: b.id, name: b.name, kind: b.kind, address: b.address, city: b.city, lat: b.lat, lng: b.lng,
      rating: b.rating, reviewCount: b.reviewCount, distanceKm: Math.round(distanceKm(input.lat, input.lng, b.lat, b.lng) * 10) / 10,
      laborPrice: o.price, daysToMake: o.daysToMake, fabricPrice, estimate, withinBudget: estimate <= input.budget,
      materials: b.materials.map((m) => ({ id: m.id, name: m.name, design: m.design, color: m.color, pricePerYard: m.pricePerYard, imageUrl: m.imageUrl })),
    });
  }

  const byFit = (a: Recommendation, b: Recommendation) =>
    Number(b.withinBudget) - Number(a.withinBudget) || a.distanceKm - b.distanceKm;

  const nearby = all.filter((r) => r.distanceKm <= SEARCH_RADIUS_KM).sort(byFit);
  if (nearby.length) return { yardsNeeded: style.yardsNeeded, results: nearby, widened: false };
  // Nobody close by: show the nearest few anywhere so the client still has options.
  return { yardsNeeded: style.yardsNeeded, results: all.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 5), widened: true };
}
