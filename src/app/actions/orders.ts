"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FABRIC_DESIGNS, FEES, MEASUREMENT_FIELDS } from "@/lib/constants";
import { deliveryFee, distanceKm } from "@/lib/geo";
import { recommendTailors } from "@/lib/recommend";

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const measurementsSchema = z.record(z.enum(MEASUREMENT_FIELDS.map((f) => f.key) as [string, ...string[]]), z.number().positive().max(120));

export async function getRecommendations(input: { styleId: string; design: string; budget: number; lat: number; lng: number }) {
  await requireUser("CLIENT");
  const parsed = z.object({
    styleId: z.string().min(1),
    design: z.enum(["OWN", ...Object.keys(FABRIC_DESIGNS)] as [string, ...string[]]),
    budget: z.number().positive(),
  }).merge(latLng).parse(input);
  return recommendTailors(parsed);
}

const sewOrderSchema = z.object({
  styleId: z.string().min(1),
  businessId: z.string().min(1),
  materialId: z.string().nullable(),
  budget: z.number().positive(),
  notes: z.string().max(1000).default(""),
  measurementMethod: z.enum(["SELF", "HOME_VISIT", "AT_SHOP"]),
  measurements: measurementsSchema.optional(),
  measurementTime: z.string().datetime().optional(),
  fulfilment: z.enum(["DELIVERY", "PICKUP"]),
  location: latLng.nullable(),
  address: z.string().max(300).default(""),
});

export type PlaceOrderResult = { error: string } | undefined;

export async function placeSewOrder(input: z.input<typeof sewOrderSchema>): Promise<PlaceOrderResult> {
  const user = await requireUser("CLIENT");
  const parsed = sewOrderSchema.safeParse(input);
  if (!parsed.success) return { error: "Some details are missing or invalid. Please check each step." };
  const o = parsed.data;

  if (o.measurementMethod === "SELF" && Object.keys(o.measurements ?? {}).length < 3) {
    return { error: "Enter at least three of your measurements." };
  }
  if (o.measurementMethod === "HOME_VISIT") {
    if (!o.measurementTime || new Date(o.measurementTime) < new Date()) return { error: "Choose a future time for your measurement visit." };
  }
  if ((o.measurementMethod === "HOME_VISIT" || o.fulfilment === "DELIVERY") && (!o.location || o.address.trim().length < 3)) {
    return { error: "Share your location and enter an address or landmark." };
  }

  const offer = await db.businessStyle.findUnique({
    where: { businessId_styleId: { businessId: o.businessId, styleId: o.styleId } },
    include: { business: true, style: true },
  });
  if (!offer || offer.business.verificationStatus !== "VERIFIED") return { error: "This tailor is not available for that style." };

  const yards = offer.style.yardsNeeded;
  let materialPrice = 0;
  if (o.materialId) {
    const m = await db.material.findUnique({ where: { id: o.materialId } });
    if (!m || m.businessId !== o.businessId) return { error: "That fabric isn't sold by this tailor." };
    materialPrice = Math.round(m.pricePerYard * yards);
  }
  const measurementFee = o.measurementMethod === "HOME_VISIT" ? FEES.homeMeasurement : 0;
  const delivery = o.fulfilment === "DELIVERY" && o.location
    ? deliveryFee(distanceKm(offer.business.lat, offer.business.lng, o.location.lat, o.location.lng))
    : 0;
  const total = offer.price + materialPrice + measurementFee + delivery;

  const order = await db.$transaction(async (tx) => {
    if (o.materialId) {
      // Conditional decrement so two clients can't buy the same last yards.
      const res = await tx.material.updateMany({
        where: { id: o.materialId, yardsInStock: { gte: yards } },
        data: { yardsInStock: { decrement: yards } },
      });
      if (res.count === 0) return null;
    }
    return tx.order.create({
      data: {
        kind: "SEW", clientId: user.id, businessId: o.businessId, styleId: o.styleId, materialId: o.materialId,
        yards: o.materialId ? yards : 0, ownFabric: !o.materialId, notes: o.notes, budget: o.budget,
        measurementMethod: o.measurementMethod,
        measurementTime: o.measurementTime ? new Date(o.measurementTime) : null,
        measurements: o.measurementMethod === "SELF" ? JSON.stringify(o.measurements) : null,
        fulfilment: o.fulfilment, clientAddress: o.address || null,
        clientLat: o.location?.lat ?? null, clientLng: o.location?.lng ?? null,
        laborPrice: offer.price, materialPrice, measurementFee, deliveryFee: delivery, total,
      },
    });
  });
  if (!order) return { error: "Sorry, that fabric just sold out. Please pick another." };

  redirect(`/orders/${order.id}?placed=1`);
}

const fabricOrderSchema = z.object({
  materialId: z.string().min(1),
  yards: z.number().min(0.5).max(100),
  fulfilment: z.enum(["DELIVERY", "PICKUP"]),
  location: latLng.nullable(),
  address: z.string().max(300).default(""),
});

export async function placeFabricOrder(input: z.input<typeof fabricOrderSchema>): Promise<PlaceOrderResult> {
  const user = await requireUser("CLIENT");
  const parsed = fabricOrderSchema.safeParse(input);
  if (!parsed.success) return { error: "Please check the quantity and delivery details." };
  const o = parsed.data;
  if (o.fulfilment === "DELIVERY" && (!o.location || o.address.trim().length < 3)) {
    return { error: "Share your location and enter an address or landmark for delivery." };
  }

  const m = await db.material.findUnique({ where: { id: o.materialId }, include: { business: true } });
  if (!m || m.business.verificationStatus !== "VERIFIED") return { error: "This fabric is not available." };

  const materialPrice = Math.round(m.pricePerYard * o.yards);
  const delivery = o.fulfilment === "DELIVERY" && o.location
    ? deliveryFee(distanceKm(m.business.lat, m.business.lng, o.location.lat, o.location.lng))
    : 0;

  const order = await db.$transaction(async (tx) => {
    const res = await tx.material.updateMany({
      where: { id: m.id, yardsInStock: { gte: o.yards } },
      data: { yardsInStock: { decrement: o.yards } },
    });
    if (res.count === 0) return null;
    return tx.order.create({
      data: {
        kind: "FABRIC", clientId: user.id, businessId: m.businessId, materialId: m.id, yards: o.yards,
        fulfilment: o.fulfilment, clientAddress: o.address || null,
        clientLat: o.location?.lat ?? null, clientLng: o.location?.lng ?? null,
        materialPrice, deliveryFee: delivery, total: materialPrice + delivery,
      },
    });
  });
  if (!order) return { error: `Only ${m.yardsInStock} yards left in stock.` };

  redirect(`/orders/${order.id}?placed=1`);
}

// ---------- Status changes ----------

/** Move an order from one status to another only if it is still in the expected state. */
async function transition(where: Record<string, unknown>, data: Record<string, unknown>) {
  const res = await db.order.updateMany({ where, data });
  if (res.count === 0) throw new Error("This order has changed. Refresh the page and try again.");
  revalidatePath("/", "layout");
}

async function restoreStock(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.materialId && order.yards > 0) {
    await db.material.update({ where: { id: order.materialId }, data: { yardsInStock: { increment: order.yards } } });
  }
}

function parseMeasurements(formData: FormData) {
  const values: Record<string, number> = {};
  for (const f of MEASUREMENT_FIELDS) {
    const v = Number(formData.get(f.key));
    if (v > 0) values[f.key] = v;
  }
  const parsed = measurementsSchema.safeParse(values);
  if (!parsed.success || Object.keys(values).length < 3) throw new Error("Enter at least three valid measurements (in inches).");
  return JSON.stringify(parsed.data);
}

export async function clientCancel(orderId: string) {
  const user = await requireUser("CLIENT");
  await transition({ id: orderId, clientId: user.id, status: "PLACED" }, { status: "CANCELLED" });
  await restoreStock(orderId);
}

async function myBusinessId() {
  const user = await requireUser("BUSINESS");
  if (!user.business || user.business.verificationStatus !== "VERIFIED") throw new Error("Your business must be verified first.");
  return user.business.id;
}

export async function businessAccept(orderId: string) {
  const businessId = await myBusinessId();
  const order = await db.order.findFirstOrThrow({ where: { id: orderId, businessId } });
  const next =
    order.kind === "FABRIC" ? "READY"
    : order.measurementMethod === "SELF" ? "MEASURED"
    : "AWAITING_MEASUREMENT";
  await transition({ id: orderId, businessId, status: "PLACED" }, { status: next });
}

export async function businessDecline(orderId: string) {
  const businessId = await myBusinessId();
  await transition({ id: orderId, businessId, status: "PLACED" }, { status: "DECLINED" });
  await restoreStock(orderId);
}

/** For clients who come to the shop to be measured. */
export async function businessRecordMeasurements(orderId: string, formData: FormData) {
  const businessId = await myBusinessId();
  await transition(
    { id: orderId, businessId, status: "AWAITING_MEASUREMENT", measurementMethod: "AT_SHOP" },
    { status: "MEASURED", measurements: parseMeasurements(formData) },
  );
}

export async function businessStartSewing(orderId: string) {
  const businessId = await myBusinessId();
  await transition({ id: orderId, businessId, status: "MEASURED" }, { status: "SEWING" });
}

export async function businessMarkReady(orderId: string) {
  const businessId = await myBusinessId();
  await transition({ id: orderId, businessId, status: "SEWING" }, { status: "READY" });
}

export async function businessMarkCollected(orderId: string) {
  const businessId = await myBusinessId();
  await transition({ id: orderId, businessId, status: "READY", fulfilment: "PICKUP" }, { status: "COMPLETED" });
}

async function requireVerifiedAgent(role: "MEASURER" | "RIDER") {
  const user = await requireUser(role);
  if (user.verificationStatus !== "VERIFIED") throw new Error("Your account must be verified before taking jobs.");
  return user;
}

export async function measurerClaim(orderId: string) {
  const user = await requireVerifiedAgent("MEASURER");
  await transition(
    { id: orderId, status: "AWAITING_MEASUREMENT", measurementMethod: "HOME_VISIT", measurerId: null },
    { measurerId: user.id },
  );
}

export async function measurerSubmit(orderId: string, formData: FormData) {
  const user = await requireVerifiedAgent("MEASURER");
  await transition(
    { id: orderId, status: "AWAITING_MEASUREMENT", measurerId: user.id },
    { status: "MEASURED", measurements: parseMeasurements(formData) },
  );
}

export async function riderClaim(orderId: string) {
  const user = await requireVerifiedAgent("RIDER");
  await transition(
    { id: orderId, status: "READY", fulfilment: "DELIVERY", riderId: null },
    { riderId: user.id, status: "OUT_FOR_DELIVERY" },
  );
}

export async function riderDelivered(orderId: string) {
  const user = await requireVerifiedAgent("RIDER");
  await transition({ id: orderId, status: "OUT_FOR_DELIVERY", riderId: user.id }, { status: "COMPLETED" });
}
