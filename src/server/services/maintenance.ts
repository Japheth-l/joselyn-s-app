import { db } from "@/lib/db";
import { addDays, formatDateTime } from "@/lib/time";
import { releaseOrderReservations } from "../inventory";
import { log } from "../log";
import { notify, notifyBusiness } from "../notifications";
import { transition } from "../order-flow";
import { getSettings } from "../settings";
import { completeOrder } from "./orders";
import { verifyByReference } from "./payments";

/*
 * Scheduled housekeeping, run by /api/cron (Render cron job or any scheduler with CRON_SECRET).
 * Every job is idempotent and works in small batches; conditional updates mean two overlapping runs
 * can't double-apply anything. Each job's failures are logged and don't stop the others.
 */

const BATCH = 50;

/** Submitted quotations past their validity date expire; an order left with none goes back to collecting quotes. */
export async function expireQuotations(now = new Date()) {
  const stale = await db.quotation.findMany({ where: { status: "SUBMITTED", validUntil: { lt: now }, order: { status: { in: ["QUOTE_REQUESTED", "QUOTED"] } } }, take: BATCH });
  let expired = 0;
  for (const q of stale) {
    await db.$transaction(async (tx) => {
      const r = await tx.quotation.updateMany({ where: { id: q.id, status: "SUBMITTED" }, data: { status: "EXPIRED" } });
      expired += r.count;
      const o = await tx.order.findUniqueOrThrow({ where: { id: q.orderId } });
      const live = await tx.quotation.count({ where: { orderId: o.id, status: "SUBMITTED" } });
      if (o.status === "QUOTED" && live === 0 && o.kind === "CUSTOM") {
        await transition(tx, { orderId: o.id, from: "QUOTED", to: "QUOTE_REQUESTED", actorId: null, as: "SYSTEM", note: "Every quotation expired" });
      }
    });
  }
  return expired;
}

/**
 * Orders whose stock hold has lapsed without payment are cancelled and the stock released. A payment
 * started in the last 30 minutes postpones this, so a customer mid-checkout isn't cut off; a payment
 * that still lands afterwards is refunded automatically (see applyConfirmedPayment).
 */
export async function cancelUnpaidOrders(now = new Date()) {
  const settings = await getSettings();
  const cutoff = new Date(now.getTime() - settings.reservationHours * 3_600_000);
  const recentCheckout = new Date(now.getTime() - 30 * 60_000);
  const candidates = await db.order.findMany({
    where: {
      status: { in: ["QUOTE_REQUESTED", "AWAITING_PAYMENT"] },
      amountPaidMinor: 0,
      payments: { none: { status: "PENDING", createdAt: { gt: recentCheckout } } },
      OR: [
        // Fabric held for this order has expired.
        { reservations: { some: { status: "ACTIVE", expiresAt: { lt: now } } } },
        // Accepted but unpaid for longer than the hold period (no stock involved).
        { status: "AWAITING_PAYMENT", reservations: { none: { status: "ACTIVE" } }, updatedAt: { lt: cutoff } },
      ],
    },
    take: BATCH,
  });
  let cancelled = 0;
  for (const o of candidates) {
    // A fabric order waiting for the seller and a custom order still collecting quotes only lapse via reservations.
    if (o.status === "QUOTE_REQUESTED" && o.kind !== "FABRIC") continue;
    try {
      await db.$transaction(async (tx) => {
        await releaseOrderReservations(tx, o.id, null, "Hold expired without payment");
        await transition(tx, { orderId: o.id, from: o.status, to: "CANCELLED", actorId: null, as: "SYSTEM", note: "Not paid in time", set: { cancelReason: "Payment wasn't received in time, so the reserved fabric was released." } });
      });
      cancelled++;
      await notify(o.customerId, "order.cancelled", { order: o.number, reason: "Payment wasn't received in time." }, { link: `/orders/${o.id}`, orderId: o.id });
      if (o.businessId) await notifyBusiness(o.businessId, "order.cancelled", { order: o.number, reason: "The customer didn't pay in time." }, { orderId: o.id });
    } catch (e) {
      // Most likely the order moved on (paid) between the query and the update.
      log.info("maintenance.cancel_skipped", { orderId: o.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return cancelled;
}

/** Delivered or collected orders the customer hasn't confirmed complete automatically after the configured days. */
export async function autoCompleteOrders(now = new Date()) {
  const settings = await getSettings();
  const cutoff = addDays(now, -settings.autoCompleteDays);
  const orders = await db.order.findMany({
    where: { status: { in: ["DELIVERED", "COLLECTED"] }, events: { some: { toStatus: { in: ["DELIVERED", "COLLECTED"] }, createdAt: { lt: cutoff } } } },
    take: BATCH,
  });
  let done = 0;
  for (const o of orders) {
    try {
      await completeOrder(o.id, o.status, null, "SYSTEM");
      done++;
    } catch (e) {
      log.info("maintenance.complete_skipped", { orderId: o.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return done;
}

/** Visit requests nobody accepted before the window ended fail, so the customer can rebook. */
export async function expireAppointmentRequests(now = new Date()) {
  const stale = await db.appointment.findMany({ where: { status: "REQUESTED", windowEnd: { lt: now } }, include: { order: true }, take: BATCH });
  for (const a of stale) {
    const r = await db.appointment.updateMany({ where: { id: a.id, status: "REQUESTED" }, data: { status: "FAILED", failureReason: "No measurement professional was available in that window" } });
    if (r.count && a.order) {
      await notify(a.customerId, "appointment.failed", { order: a.order.number, reason: "no professional was available in that window" }, { link: `/orders/${a.order.id}`, orderId: a.order.id });
    }
  }
  return stale.length;
}

/** Reminders for accepted visits starting within the next 24 hours, sent once. */
export async function sendAppointmentReminders(now = new Date()) {
  const soon = await db.appointment.findMany({
    where: { status: "ACCEPTED", reminderSentAt: null, windowStart: { gt: now, lt: new Date(now.getTime() + 24 * 3_600_000) } },
    include: { order: true },
    take: BATCH,
  });
  let sent = 0;
  for (const a of soon) {
    const claimed = await db.appointment.updateMany({ where: { id: a.id, reminderSentAt: null }, data: { reminderSentAt: now } });
    if (!claimed.count) continue;
    const vars = { order: a.order?.number ?? "", when: formatDateTime(a.windowStart) };
    await notify(a.customerId, "appointment.reminder", vars, { link: a.orderId ? `/orders/${a.orderId}` : "/appointments", orderId: a.orderId ?? undefined });
    if (a.professionalId) await notify(a.professionalId, "appointment.reminder", vars, { link: `/pro/measurements/${a.id}` });
    sent++;
  }
  return sent;
}

/** Checkouts with no webhook after 15 minutes are re-verified with the provider (covers missed webhooks). */
export async function reverifyPendingPayments(now = new Date()) {
  const pending = await db.payment.findMany({
    where: { status: "PENDING", provider: "PAYSTACK", createdAt: { lt: new Date(now.getTime() - 15 * 60_000), gt: addDays(now, -2) } },
    take: 20,
  });
  for (const p of pending) {
    try {
      await verifyByReference(p.providerRef);
    } catch (e) {
      log.warn("maintenance.reverify_failed", { paymentId: p.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Two days without a result: the checkout was abandoned.
  const abandoned = await db.payment.updateMany({ where: { status: "PENDING", createdAt: { lt: addDays(now, -2) } }, data: { status: "ABANDONED" } });
  return pending.length + abandoned.count;
}

export async function runMaintenance(now = new Date()) {
  const jobs = { expireQuotations, cancelUnpaidOrders, autoCompleteOrders, expireAppointmentRequests, sendAppointmentReminders, reverifyPendingPayments };
  const results: Record<string, number | string> = {};
  for (const [name, job] of Object.entries(jobs)) {
    try {
      results[name] = await job(now);
    } catch (e) {
      results[name] = "error";
      log.error("maintenance.job_failed", { job: name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  // Old rate-limit windows are useless; keep the table small.
  await db.rateLimit.deleteMany({ where: { windowStart: { lt: addDays(now, -1) } } }).catch(() => {});
  log.info("maintenance.done", results);
  return results;
}
