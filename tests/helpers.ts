import { db } from "@/lib/db";
import { loadActor } from "@/server/actor";
import type { MeasurementValues } from "@/server/services/measurements";

// Test fixtures. Every record is created through Prisma directly (not the UI), with unique emails/slugs
// so tests don't depend on each other. Nothing here runs outside the local test database.

let n = 0;
const uid = () => `${Date.now().toString(36)}${(n++).toString(36)}`;

export async function actorFor(userId: string) {
  const a = await loadActor(userId);
  if (!a) throw new Error("actor not loaded");
  return a;
}

export async function makeUser(opts: { roles?: string[]; adminPermissions?: string[]; agent?: "MEASURER" | "RIDER"; agentStatus?: string; name?: string } = {}) {
  const id = uid();
  const user = await db.user.create({
    data: {
      name: opts.name ?? `User ${id}`, email: `${id}@test.local`, phone: "0241234567", passwordHash: "x", emailVerifiedAt: new Date(),
      notificationPrefs: { sms: false, email: false, whatsapp: false },
    },
  });
  for (const role of new Set(["CUSTOMER", ...(opts.roles ?? [])])) {
    await db.roleAssignment.create({ data: { userId: user.id, role, permissions: role === "ADMIN" ? opts.adminPermissions ?? ["SUPER"] : [] } });
  }
  if (opts.agent) {
    await db.agentProfile.create({ data: { userId: user.id, kind: opts.agent, verificationStatus: opts.agentStatus ?? "VERIFIED", serviceLat: 5.6, serviceLng: -0.19, serviceRadiusKm: 30 } });
    if ((opts.agentStatus ?? "VERIFIED") === "VERIFIED") await db.roleAssignment.create({ data: { userId: user.id, role: opts.agent } });
  }
  return actorFor(user.id);
}

export async function makeBusiness(opts: { verified?: boolean; kinds?: string[]; lat?: number; lng?: number; capacityPerWeek?: number } = {}) {
  const owner = await makeUser({ name: "Owner" });
  const id = uid();
  const business = await db.business.create({
    data: {
      name: `Shop ${id}`, slug: `shop-${id}`, kinds: opts.kinds ?? ["TAILOR", "FABRIC_SELLER"], phone: "0201234567", address: "Oxford St", city: "Accra",
      lat: opts.lat ?? 5.6037, lng: opts.lng ?? -0.187, registrationNumber: `BN-${id}`, verificationStatus: opts.verified === false ? "PENDING" : "VERIFIED",
      capacityPerWeek: opts.capacityPerWeek ?? 10,
      members: { create: { userId: owner.userId, role: "OWNER" } },
    },
  });
  return { business, owner: await actorFor(owner.userId) };
}

export async function makeStyle(opts: { measurementKeys?: string[]; fabricQtyCenti?: number } = {}) {
  const id = uid();
  return db.style.create({
    data: {
      slug: `style-${id}`, name: `Kaba ${id}`, categoryId: "cat_kaba", wearer: "WOMEN", description: "Test style", icon: "👗",
      fabricQtyCenti: opts.fabricQtyCenti ?? 600, measurementKeys: opts.measurementKeys ?? ["chest", "waist", "hips"],
      options: { create: [{ key: "sleeve", label: "Sleeve", choices: ["Short", "Long"] }] },
    },
  });
}

export async function offerStyle(businessId: string, styleId: string, priceMinor: number | null = 20000, daysToMake = 7) {
  return db.businessStyle.create({ data: { businessId, styleId, priceMinor, daysToMake } });
}

export async function makeListing(businessId: string, qtyCenti: number, pricePerUnitMinor = 5000) {
  return db.fabricListing.create({
    data: { businessId, name: `Wax ${uid()}`, fabricType: "WAX_PRINT", color: "#aa3300", pricePerUnitMinor, qtyOnHandCenti: qtyCenti },
  });
}

export const MEASUREMENTS: MeasurementValues = {
  chest: { value: 36, unit: "in" }, waist: { value: 30, unit: "in" }, hips: { value: 40, unit: "in" },
};

export async function ledgerTotal() {
  const agg = await db.ledgerEntry.aggregate({ _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0;
}
export async function paidTotal() {
  const agg = await db.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0;
}

export const tomorrowPlus = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
};
