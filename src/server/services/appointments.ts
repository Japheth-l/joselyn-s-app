import { db } from "@/lib/db";
import { distanceKm, roundKm } from "@/lib/geo";
import { formatDateTime, parseLocalDateTime } from "@/lib/time";
import type { Actor } from "../actor";
import { isAdmin, requireMember, requireVerifiedAgent } from "../authz";
import { conflict, invalid, notFound } from "../errors";
import { notify, notifyBusiness } from "../notifications";
import { orderEvent, transition } from "../order-flow";
import { addRecord, checkRequired, type MeasurementValues } from "./measurements";

/** Offers for a professional: paid orders' visits in their area. Exact address only after accepting. */
export async function measurementOffers(actor: Actor) {
  const profile = await db.agentProfile.findFirst({ where: { userId: actor.userId, kind: "MEASURER" } });
  if (!profile) return [];
  const appts = await db.appointment.findMany({
    where: { status: "REQUESTED", kind: "HOME_VISIT", windowStart: { gt: new Date() }, order: { status: "AWAITING_MEASUREMENTS" } },
    include: { order: { include: { style: true } } },
    orderBy: { windowStart: "asc" },
    take: 100,
  });
  return appts
    .filter((a) => a.order && a.order.amountPaidMinor >= a.order.depositMinor && a.lat != null && a.lng != null)
    .map((a) => ({
      id: a.id, windowStart: a.windowStart, windowEnd: a.windowEnd, feeMinor: a.feeMinor, garment: a.order?.style?.name ?? "Garment",
      measurementKeys: a.order?.style?.measurementKeys ?? [],
      distanceKm: profile.serviceLat != null && profile.serviceLng != null ? roundKm(distanceKm(profile.serviceLat, profile.serviceLng, a.lat!, a.lng!)) : null,
    }))
    .filter((a) => a.distanceKm == null || a.distanceKm <= profile.serviceRadiusKm);
}

/** Accept a visit. Rejected if it overlaps another visit the professional has accepted. */
export async function acceptAppointment(actor: Actor, appointmentId: string) {
  requireVerifiedAgent(actor, "MEASURER");
  const ap = await db.appointment.findUnique({ where: { id: appointmentId }, include: { order: true, customer: true } });
  if (!ap || ap.status !== "REQUESTED") throw conflict("This visit has already been taken or cancelled.");
  if (!ap.order || ap.order.amountPaidMinor < ap.order.depositMinor) throw invalid("This visit isn't open yet.");
  await db.$transaction(async (tx) => {
    const clash = await tx.appointment.findFirst({
      where: { professionalId: actor.userId, status: "ACCEPTED", windowStart: { lt: ap.windowEnd }, windowEnd: { gt: ap.windowStart } },
    });
    if (clash) throw conflict(`This overlaps your visit on ${formatDateTime(clash.windowStart)}.`);
    const res = await tx.appointment.updateMany({ where: { id: ap.id, status: "REQUESTED", professionalId: null }, data: { status: "ACCEPTED", professionalId: actor.userId, acceptedAt: new Date() } });
    if (res.count === 0) throw conflict("Another professional has just taken this visit.");
    await orderEvent(tx, ap.orderId!, "MEASUREMENT", actor.userId, "MEASURER", `${actor.name} will take the measurements`);
  });
  await notify(ap.customerId, "appointment.accepted", { name: actor.name, when: formatDateTime(ap.windowStart), phone: actor.phone }, { link: `/orders/${ap.orderId}`, orderId: ap.orderId ?? undefined });
}

async function myAppointment(actor: Actor, appointmentId: string) {
  requireVerifiedAgent(actor, "MEASURER");
  const ap = await db.appointment.findUnique({ where: { id: appointmentId }, include: { order: { include: { style: true } }, customer: true } });
  if (!ap || ap.professionalId !== actor.userId) throw notFound("Appointment");
  return ap;
}

/** Details (address, phone) only for the assigned professional. */
export async function getAppointmentForProfessional(actor: Actor, appointmentId: string) {
  const ap = await db.appointment.findUnique({ where: { id: appointmentId }, include: { order: { include: { style: true } }, customer: true } });
  if (!ap || (ap.professionalId !== actor.userId && !isAdmin(actor, "ORDERS"))) throw notFound("Appointment");
  const draft = await db.measurementRecord.findFirst({ where: { appointmentId, status: "DRAFT" } });
  return { ap, draft };
}

/**
 * Save a draft or submit measurements for an assigned visit. Submitting attaches the record to the order,
 * moves the order on, and asks the customer to review it.
 */
export async function submitAppointmentMeasurements(actor: Actor, appointmentId: string, values: MeasurementValues, opts: { draft: boolean; notes?: string }) {
  const ap = await myAppointment(actor, appointmentId);
  if (ap.status !== "ACCEPTED") throw invalid("This visit isn't open for measurements.");
  if (!opts.draft) checkRequired(values, ap.order?.style?.measurementKeys ?? []);
  const profileId = ap.profileId ?? (await db.measurementProfile.findFirst({ where: { ownerId: ap.customerId } }))?.id;
  if (!profileId) throw invalid("The customer's measurement profile is missing.");
  await db.$transaction(async (tx) => {
    const existingDraft = await tx.measurementRecord.findFirst({ where: { appointmentId, status: "DRAFT" } });
    if (opts.draft) {
      if (existingDraft) await tx.measurementRecord.update({ where: { id: existingDraft.id }, data: { values, notes: opts.notes ?? "" } });
      else await addRecord(tx, { profileId, values, source: "PROFESSIONAL", status: "DRAFT", createdById: actor.userId, appointmentId, notes: opts.notes });
      return;
    }
    if (existingDraft) await tx.measurementRecord.delete({ where: { id: existingDraft.id } });
    const rec = await addRecord(tx, { profileId, values, source: "PROFESSIONAL", status: "SUBMITTED", createdById: actor.userId, appointmentId, notes: opts.notes });
    const done = await tx.appointment.updateMany({ where: { id: ap.id, status: "ACCEPTED" }, data: { status: "COMPLETED", completedAt: new Date() } });
    if (done.count === 0) throw conflict("This visit has just changed.");
    if (ap.orderId && ap.order?.status === "AWAITING_MEASUREMENTS") {
      await transition(tx, { orderId: ap.orderId, from: "AWAITING_MEASUREMENTS", to: "MEASUREMENTS_CONFIRMED", actorId: actor.userId, as: "SYSTEM", note: "Professional submitted measurements", set: { measurementRecordId: rec.id } });
    }
  });
  if (!opts.draft && ap.orderId) {
    await notify(ap.customerId, "measurements.submitted", { order: ap.order?.number ?? "" }, { link: `/orders/${ap.orderId}`, orderId: ap.orderId });
    if (ap.order?.businessId) await notifyBusiness(ap.order.businessId, "measurements.submitted", { order: ap.order.number }, { link: `/biz/${ap.order.businessId}/orders/${ap.orderId}`, orderId: ap.orderId });
  }
}

/**
 * Controlled correction: the professional who took the measurements submits a new revision before
 * sewing starts. The old revision is kept (superseded) for the record.
 */
export async function correctMeasurements(actor: Actor, appointmentId: string, values: MeasurementValues, reason: string) {
  const ap = await myAppointment(actor, appointmentId);
  if (ap.status !== "COMPLETED") throw invalid("Only completed visits can be corrected.");
  if (!reason.trim()) throw invalid("Explain what you're correcting.");
  if (!ap.order || !["AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED"].includes(ap.order.status)) throw invalid("Sewing has started, so measurements can't be changed now. Contact the business.");
  checkRequired(values, ap.order.style?.measurementKeys ?? []);
  // The visit may have used the customer's default profile (profileId empty): correct the same profile.
  const profileId = ap.profileId ?? (await db.measurementRecord.findFirst({ where: { appointmentId, status: { not: "DRAFT" } }, orderBy: { revision: "desc" } }))?.profileId;
  if (!profileId) throw invalid("The original measurements could not be found.");
  await db.$transaction(async (tx) => {
    const rec = await addRecord(tx, { profileId, values, source: "PROFESSIONAL", status: "SUBMITTED", createdById: actor.userId, appointmentId, notes: `Correction: ${reason}` });
    await tx.order.update({ where: { id: ap.orderId! }, data: { measurementRecordId: rec.id } });
    await orderEvent(tx, ap.orderId!, "MEASUREMENT", actor.userId, "MEASURER", "Measurements corrected", { reason });
  });
  await notify(ap.customerId, "measurements.submitted", { order: ap.order.number }, { link: `/orders/${ap.orderId}`, orderId: ap.orderId! });
}

export async function failAppointment(actor: Actor, appointmentId: string, reason: string) {
  const ap = await myAppointment(actor, appointmentId);
  if (ap.status !== "ACCEPTED") throw invalid("Only accepted visits can be marked as failed.");
  if (!reason.trim()) throw invalid("Say what happened.");
  await db.appointment.update({ where: { id: ap.id }, data: { status: "FAILED", failureReason: reason.slice(0, 300) } });
  if (ap.orderId) await orderEvent(db, ap.orderId, "MEASUREMENT", actor.userId, "MEASURER", `Visit failed: ${reason}`);
  await notify(ap.customerId, "appointment.failed", { order: ap.order?.number ?? "", reason }, { link: `/orders/${ap.orderId}`, orderId: ap.orderId ?? undefined });
}

/** The professional hands back an accepted visit they can't make (more than 2 hours before it). */
export async function releaseAppointment(actor: Actor, appointmentId: string) {
  const ap = await myAppointment(actor, appointmentId);
  if (ap.status !== "ACCEPTED") throw invalid("You can only hand back an accepted visit.");
  if (ap.windowStart.getTime() - Date.now() < 2 * 3_600_000) throw invalid("It's too close to the visit. Mark it as failed instead.");
  await db.appointment.update({ where: { id: ap.id }, data: { status: "REQUESTED", professionalId: null, acceptedAt: null } });
}

/** Customer reschedules (or rebooks after a failed visit). Any assigned professional is released. */
export async function rescheduleAppointment(actor: Actor, orderId: string, start: string, end: string) {
  const s = parseLocalDateTime(start);
  const e = parseLocalDateTime(end);
  if (!s || !e || e <= s) throw invalid("Choose a start and end time.");
  if (s < new Date(Date.now() + 2 * 3_600_000)) throw invalid("Choose a time at least two hours from now.");
  const order = await db.order.findUnique({ where: { id: orderId }, include: { appointments: { orderBy: { createdAt: "desc" } } } });
  if (!order || order.customerId !== actor.userId) throw notFound("Order");
  if (!["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS"].includes(order.status)) throw invalid("This order no longer needs a measurement visit.");
  const current = order.appointments.find((a) => ["REQUESTED", "ACCEPTED", "FAILED"].includes(a.status));
  if (!current) throw invalid("There's no visit to reschedule.");
  const previousPro = current.status === "ACCEPTED" ? current.professionalId : null;
  if (current.status === "FAILED") {
    await db.appointment.create({
      data: { kind: "HOME_VISIT", customerId: actor.userId, orderId, profileId: current.profileId, windowStart: s, windowEnd: e, addressText: current.addressText, lat: current.lat, lng: current.lng, feeMinor: current.feeMinor },
    });
  } else {
    await db.appointment.update({ where: { id: current.id }, data: { windowStart: s, windowEnd: e, status: "REQUESTED", professionalId: null, acceptedAt: null, reminderSentAt: null } });
  }
  await orderEvent(db, orderId, "MEASUREMENT", actor.userId, "CUSTOMER", `Visit moved to ${formatDateTime(s)}`);
  if (previousPro) await notify(previousPro, "order.status", { order: order.number, status: "the customer rescheduled the measurement visit, so it was released" }, { link: "/pro/measurements" });
  const { announceAppointments } = await import("./deliveries");
  await announceAppointments(orderId);
}

/** Workshop fitting appointment with a business (no fee). */
export async function bookWorkshopVisit(actor: Actor, orderId: string, start: string) {
  const s = parseLocalDateTime(start);
  if (!s || s < new Date()) throw invalid("Choose a future date and time.");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== actor.userId || !order.businessId) throw notFound("Order");
  if (order.measurementMethod !== "AT_WORKSHOP") throw invalid("This order isn't set up for workshop measurement.");
  await db.appointment.create({ data: { kind: "WORKSHOP", customerId: actor.userId, orderId, businessId: order.businessId, windowStart: s, windowEnd: new Date(s.getTime() + 3_600_000), status: "ACCEPTED" } });
  await notifyBusiness(order.businessId, "order.status", { order: order.number, status: `customer will visit for measurements on ${formatDateTime(s)}` }, { orderId });
}

export async function businessAppointments(actor: Actor, businessId: string) {
  requireMember(actor, businessId, "STAFF");
  // Workshop visits carry the businessId; home visits are linked through the business's order.
  return db.appointment.findMany({
    where: { status: { in: ["ACCEPTED", "REQUESTED"] }, OR: [{ businessId }, { order: { businessId } }] },
    include: { customer: { select: { name: true } }, order: { select: { id: true, number: true, status: true } }, professional: { select: { name: true } } },
    orderBy: { windowStart: "asc" },
  });
}
