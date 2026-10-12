import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { distanceKm, roundKm } from "@/lib/geo";
import type { Actor } from "../actor";
import { isAdmin, requireMember, requireVerifiedAgent } from "../authz";
import { conflict, invalid, notFound } from "../errors";
import { consumeOrderReservations } from "../inventory";
import { notify, notifyBusiness, notifyMany } from "../notifications";
import { orderEvent, transition } from "../order-flow";
import { formatDateTime } from "@/lib/time";
import { rateLimit } from "../rate-limit";
import { hashCode, newHandoverCode } from "./orders";

/**
 * When an order is READY, fully paid and the customer chose delivery, open its delivery leg to riders
 * and send the customer their handover code. Safe to call repeatedly.
 */
export async function dispatchIfReady(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { business: true, deliveries: true } });
  if (!order || order.status !== "READY" || order.fulfilment !== "DELIVERY" || order.amountPaidMinor < order.totalMinor || !order.business) return;
  let leg = order.deliveries.find((d) => d.status === "PENDING_PAYMENT");
  if (!leg && order.kind === "FABRIC" && !order.deliveries.some((d) => ["OPEN", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(d.status))) {
    // Fabric orders: the delivery fee was in the quote; create the leg now.
    const quoteDelivery = await db.quotationLine.aggregate({ where: { quotation: { orderId }, kind: "DELIVERY" }, _sum: { amountMinor: true } });
    const customer = await db.user.findUniqueOrThrow({ where: { id: order.customerId } });
    leg = await db.deliveryAssignment.create({
      data: {
        orderId, leg: order.parentOrderId ? "FABRIC_TO_TAILOR" : "FABRIC_TO_CUSTOMER", status: "PENDING_PAYMENT",
        pickupName: order.business.name, pickupAddress: `${order.business.address}, ${order.business.city}`, pickupLat: order.business.lat, pickupLng: order.business.lng,
        dropoffName: order.parentOrderId ? "Your tailor" : customer.name, dropoffAddress: order.addressText ?? "", dropoffLat: order.lat ?? order.business.lat, dropoffLng: order.lng ?? order.business.lng,
        feeMinor: quoteDelivery._sum.amountMinor ?? 0, proofCodeHash: "",
      },
    });
  }
  if (!leg) return;
  const code = newHandoverCode();
  const opened = await db.$transaction(async (tx) => {
    const res = await tx.deliveryAssignment.updateMany({ where: { id: leg!.id, status: "PENDING_PAYMENT" }, data: { status: "OPEN", proofCodeHash: hashCode(leg!.id, code) } });
    if (res.count === 0) return false;
    await transition(tx, { orderId, from: "READY", to: "DELIVERY_ASSIGNED", actorId: null, as: "SYSTEM", note: "Delivery opened to riders" });
    return true;
  });
  if (!opened) return;
  await notify(order.customerId, "order.delivery.code", { order: order.number, code }, { link: `/orders/${orderId}`, orderId });
  const riders = await db.agentProfile.findMany({ where: { kind: "RIDER", verificationStatus: "VERIFIED", available: true } });
  const near = riders.filter((r) => r.serviceLat == null || r.serviceLng == null || distanceKm(r.serviceLat, r.serviceLng, leg!.pickupLat, leg!.pickupLng) <= r.serviceRadiusKm);
  await notifyMany(near.map((r) => r.userId), "delivery.available", { fee: formatMoney(leg.feeMinor) }, { link: "/pro/deliveries" });
}

/** The customer can ask for a new handover code (the old one stops working). */
export async function reissueDeliveryCode(actor: Actor, orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { deliveries: true } });
  if (!order || order.customerId !== actor.userId) throw notFound("Order");
  const leg = order.deliveries.find((d) => ["OPEN", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(d.status));
  if (!leg) throw invalid("There's no delivery in progress.");
  const code = newHandoverCode();
  await db.deliveryAssignment.update({ where: { id: leg.id }, data: { proofCodeHash: hashCode(leg.id, code) } });
  return code;
}

// ── Riders ──

/** Open jobs near the rider: fee, pickup area and distance only. No customer details before accepting. */
export async function openDeliveries(actor: Actor) {
  const profile = await db.agentProfile.findFirst({ where: { userId: actor.userId, kind: "RIDER" } });
  if (!profile) return [];
  const legs = await db.deliveryAssignment.findMany({ where: { status: "OPEN", order: { status: "DELIVERY_ASSIGNED" } }, orderBy: { createdAt: "asc" }, take: 100 });
  return legs
    .map((l) => ({
      id: l.id, leg: l.leg, feeMinor: l.feeMinor, pickupName: l.pickupName,
      tripKm: roundKm(distanceKm(l.pickupLat, l.pickupLng, l.dropoffLat, l.dropoffLng)),
      fromRiderKm: profile.serviceLat != null && profile.serviceLng != null ? roundKm(distanceKm(profile.serviceLat, profile.serviceLng, l.pickupLat, l.pickupLng)) : null,
      createdAt: l.createdAt,
    }))
    .filter((l) => l.fromRiderKm == null || l.fromRiderKm <= profile.serviceRadiusKm);
}

/** Full details only for the assigned rider (or an operations admin). */
export async function getAssignmentForRider(actor: Actor, assignmentId: string) {
  const a = await db.deliveryAssignment.findUnique({ where: { id: assignmentId }, include: { order: { include: { customer: true, business: true } } } });
  if (!a || (a.riderId !== actor.userId && !isAdmin(actor, "ORDERS"))) throw notFound("Delivery");
  return a;
}

export async function acceptDelivery(actor: Actor, assignmentId: string) {
  requireVerifiedAgent(actor, "RIDER");
  const res = await db.deliveryAssignment.updateMany({ where: { id: assignmentId, status: "OPEN", riderId: null }, data: { status: "ACCEPTED", riderId: actor.userId, acceptedAt: new Date() } });
  if (res.count === 0) throw conflict("Another rider has just taken this delivery.");
  const a = await db.deliveryAssignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { order: true } });
  await orderEvent(db, a.orderId, "DELIVERY", actor.userId, "RIDER", `${actor.name} accepted the delivery`);
  await notify(a.order.customerId, "delivery.accepted", { name: actor.name, order: a.order.number, phone: actor.phone }, { link: `/orders/${a.orderId}`, orderId: a.orderId });
  if (a.order.businessId) await notifyBusiness(a.order.businessId, "delivery.accepted", { name: actor.name, order: a.order.number, phone: actor.phone }, { orderId: a.orderId });
}

async function riderLeg(actor: Actor, assignmentId: string) {
  requireVerifiedAgent(actor, "RIDER");
  const a = await db.deliveryAssignment.findUnique({ where: { id: assignmentId }, include: { order: true } });
  if (!a || a.riderId !== actor.userId) throw notFound("Delivery");
  return a;
}

export async function markPickedUp(actor: Actor, assignmentId: string) {
  const a = await riderLeg(actor, assignmentId);
  await db.$transaction(async (tx) => {
    const res = await tx.deliveryAssignment.updateMany({ where: { id: a.id, status: "ACCEPTED" }, data: { status: "PICKED_UP", pickedUpAt: new Date() } });
    if (res.count === 0) throw conflict("This delivery isn't waiting for pickup.");
    if (a.order.kind === "FABRIC") await consumeOrderReservations(tx, a.orderId, actor.userId);
    await transition(tx, { orderId: a.orderId, from: "DELIVERY_ASSIGNED", to: "PICKED_UP", actorId: actor.userId, as: "RIDER" });
  });
}

export async function markInTransit(actor: Actor, assignmentId: string) {
  const a = await riderLeg(actor, assignmentId);
  await db.$transaction(async (tx) => {
    const res = await tx.deliveryAssignment.updateMany({ where: { id: a.id, status: "PICKED_UP" }, data: { status: "IN_TRANSIT" } });
    if (res.count === 0) throw conflict("Mark the item as picked up first.");
    await transition(tx, { orderId: a.orderId, from: "PICKED_UP", to: "IN_TRANSIT", actorId: actor.userId, as: "RIDER" });
  });
  await notify(a.order.customerId, "order.status", { order: a.order.number, status: "the rider is on the way" }, { link: `/orders/${a.orderId}`, orderId: a.orderId });
}

/** Delivered only with the customer's handover code (proof of delivery). */
export async function markDelivered(actor: Actor, assignmentId: string, code: string) {
  const a = await riderLeg(actor, assignmentId);
  if (a.proofCodeHash === "LEGACY") throw invalid("This delivery started before handover codes existed. Ask the customer to confirm receipt in the app.");
  // Six digits can be guessed by brute force; a handful of attempts per hour is plenty for a real handover.
  await rateLimit(`handover:${a.id}`, 5, 3600);
  if (a.proofCodeHash !== hashCode(a.id, code.trim())) throw invalid("That code doesn't match. Ask the customer for the 6-digit code in their order.");
  await db.$transaction(async (tx) => {
    const res = await tx.deliveryAssignment.updateMany({ where: { id: a.id, status: { in: ["PICKED_UP", "IN_TRANSIT"] } }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    if (res.count === 0) throw conflict("This delivery can't be marked delivered now.");
    await transition(tx, { orderId: a.orderId, from: a.order.status, to: "DELIVERED", actorId: actor.userId, as: "RIDER", note: "Handover code confirmed" });
  });
  await notify(a.order.customerId, "order.status", { order: a.order.number, status: "delivered. Please confirm everything is fine" }, { link: `/orders/${a.orderId}`, orderId: a.orderId });
}

/** Legacy (V1) deliveries had no code; the customer confirms receipt instead. */
export async function customerConfirmsLegacyDelivery(actor: Actor, orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { deliveries: true } });
  if (!order || order.customerId !== actor.userId) throw notFound("Order");
  const leg = order.deliveries.find((d) => d.proofCodeHash === "LEGACY" && ["ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(d.status));
  if (!leg) throw invalid("There's nothing to confirm.");
  await db.$transaction(async (tx) => {
    await tx.deliveryAssignment.update({ where: { id: leg.id }, data: { status: "DELIVERED", deliveredAt: new Date() } });
    await transition(tx, { orderId, from: order.status, to: "DELIVERED", actorId: actor.userId, as: "CUSTOMER", note: "Customer confirmed receipt" });
  });
}

const FAIL_REASONS = ["CUSTOMER_UNAVAILABLE", "WRONG_ADDRESS", "ITEM_NOT_READY", "DAMAGED", "OTHER"] as const;

/** The rider reports a failed attempt. The item goes back to the business and the leg can be reopened. */
export async function reportDeliveryFailure(actor: Actor, assignmentId: string, reason: string, details: string) {
  const a = await riderLeg(actor, assignmentId);
  if (!FAIL_REASONS.includes(reason as never)) throw invalid("Choose what went wrong.");
  await db.$transaction(async (tx) => {
    const res = await tx.deliveryAssignment.updateMany({ where: { id: a.id, status: { in: ["ACCEPTED", "PICKED_UP", "IN_TRANSIT"] } }, data: { status: "FAILED", failureReason: `${reason}: ${details}`.slice(0, 300) } });
    if (res.count === 0) throw conflict("This delivery can't be marked failed now.");
    await transition(tx, { orderId: a.orderId, from: a.order.status, to: "READY", actorId: actor.userId, as: "RIDER", note: `Delivery failed: ${reason}`, data: { details } });
  });
  const vars = { order: a.order.number, reason: `${reason.replace(/_/g, " ").toLowerCase()}${details ? ` (${details})` : ""}` };
  await notify(a.order.customerId, "delivery.failed", vars, { link: `/orders/${a.orderId}`, orderId: a.orderId });
  if (a.order.businessId) await notifyBusiness(a.order.businessId, "delivery.failed", vars, { orderId: a.orderId });
}

/** After a failed attempt (or a rider dropping out), open a new attempt for another rider. */
export async function reopenDelivery(actor: Actor, orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { deliveries: { orderBy: { createdAt: "desc" } } } });
  if (!order) throw notFound("Order");
  const allowed = order.customerId === actor.userId || isAdmin(actor, "ORDERS") || (order.businessId && actor.memberships.some((m) => m.businessId === order.businessId));
  if (!allowed) throw notFound("Order");
  const last = order.deliveries.find((d) => ["FAILED", "CANCELLED"].includes(d.status));
  if (order.status !== "READY" || order.fulfilment !== "DELIVERY" || !last) throw invalid("There's no failed delivery to retry.");
  await db.deliveryAssignment.create({
    data: {
      orderId, leg: last.leg, status: "PENDING_PAYMENT", pickupName: last.pickupName, pickupAddress: last.pickupAddress, pickupLat: last.pickupLat, pickupLng: last.pickupLng,
      dropoffName: last.dropoffName, dropoffAddress: last.dropoffAddress, dropoffLat: last.dropoffLat, dropoffLng: last.dropoffLng,
      feeMinor: last.feeMinor, proofCodeHash: "", attempt: last.attempt + 1,
    },
  });
  await dispatchIfReady(orderId);
}

/** A rider who can't do an accepted job hands it back before pickup. */
export async function releaseDelivery(actor: Actor, assignmentId: string) {
  const a = await riderLeg(actor, assignmentId);
  const res = await db.deliveryAssignment.updateMany({ where: { id: a.id, status: "ACCEPTED" }, data: { status: "OPEN", riderId: null, acceptedAt: null } });
  if (res.count === 0) throw conflict("You can only hand back a delivery before picking it up.");
  await orderEvent(db, a.orderId, "DELIVERY", actor.userId, "RIDER", "Rider handed the delivery back");
}

// ── Appointments (measurement professionals) ──

/** Tell nearby professionals about a home visit once the order's deposit is paid. */
export async function announceAppointments(orderId: string) {
  const appts = await db.appointment.findMany({ where: { orderId, status: "REQUESTED", kind: "HOME_VISIT" }, include: { order: true } });
  for (const ap of appts) {
    if (!ap.order || ap.order.amountPaidMinor < ap.order.depositMinor || ap.lat == null || ap.lng == null) continue;
    const pros = await db.agentProfile.findMany({ where: { kind: "MEASURER", verificationStatus: "VERIFIED", available: true } });
    const near = pros.filter((p) => p.serviceLat == null || p.serviceLng == null || distanceKm(p.serviceLat, p.serviceLng, ap.lat!, ap.lng!) <= p.serviceRadiusKm);
    await notifyMany(near.map((p) => p.userId), "appointment.requested", { when: formatDateTime(ap.windowStart), amount: formatMoney(ap.feeMinor) }, { link: "/pro/measurements" });
  }
}

export async function businessCanSeeLeg(actor: Actor, businessId: string) {
  requireMember(actor, businessId, "STAFF");
}
