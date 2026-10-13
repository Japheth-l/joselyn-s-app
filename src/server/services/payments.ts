import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney, parseCedis } from "@/lib/money";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { requireAdmin } from "../authz";
import { conflict, invalid, notFound, unavailable } from "../errors";
import { customerFundsHeld, partyBalance, recordPaymentReceived, recordPayout, recordRefund, settleOrder } from "../ledger";
import { log } from "../log";
import { notify, notifyBusiness } from "../notifications";
import { orderEvent, transition } from "../order-flow";
import { appUrl, paymentProvider, providerByName } from "../payments";
import type { WebhookEvent } from "../payments/provider";
import { getSettings } from "../settings";
import { paymentStatusFor } from "./orders";

type Tx = Prisma.TransactionClient;

/** How much the customer can pay now: the deposit (or the rest of it), or the full balance. */
export function amountDue(o: { status: string; totalMinor: number; depositMinor: number; amountPaidMinor: number }, purpose: "DEPOSIT" | "BALANCE") {
  if (purpose === "DEPOSIT") return Math.max(0, o.depositMinor - o.amountPaidMinor);
  return Math.max(0, o.totalMinor - o.amountPaidMinor);
}

const PAYABLE = ["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION", "QUALITY_CHECK", "READY"];

/** Create a pending payment and return the provider's checkout page. */
export async function startPayment(actor: Actor, orderId: string, purpose: "DEPOSIT" | "BALANCE") {
  const provider = paymentProvider();
  if (!provider) throw unavailable("Online payment isn't switched on yet. Please contact support.");
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== actor.userId) throw notFound("Order");
  if (!PAYABLE.includes(order.status)) throw invalid("This order can't be paid at this stage.");
  const amount = amountDue(order, purpose);
  if (amount <= 0) throw invalid(purpose === "DEPOSIT" ? "The deposit is already paid." : "Nothing is left to pay.");
  const reference = `NT${order.number}-${crypto.randomBytes(5).toString("hex")}`;
  const payment = await db.payment.create({
    data: { orderId, purpose: purpose === "DEPOSIT" && order.amountPaidMinor === 0 && amount < order.totalMinor ? "DEPOSIT" : order.amountPaidMinor > 0 ? "BALANCE" : "FULL", amountMinor: amount, provider: provider.name, providerRef: reference, createdById: actor.userId },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  try {
    const { redirectUrl } = await provider.initialize({
      reference, amountMinor: amount, email: user.email, callbackUrl: `${appUrl()}/pay/callback`, metadata: { orderId, paymentId: payment.id },
    });
    return redirectUrl;
  } catch (e) {
    await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: "Could not start checkout" } });
    log.error("payment.initialize_failed", { paymentId: payment.id, error: e instanceof Error ? e.message : String(e) });
    throw unavailable("We couldn't start the payment. Please try again in a moment.");
  }
}

/**
 * Apply a provider-confirmed payment. Idempotent: the event key and the PENDING→SUCCEEDED update both
 * guard against duplicates, and ledger entries are keyed by payment id.
 */
async function applyConfirmedPayment(reference: string, check: { status: string; amountMinor: number; currency: string; eventKey: string }, provider: string, eventType: string) {
  const payment = await db.payment.findUnique({ where: { providerRef: reference } });
  if (!payment) {
    log.warn("payment.unknown_reference", { reference });
    return { applied: false, reason: "unknown" as const };
  }
  // Nothing final yet: record nothing, so the later success isn't mistaken for a duplicate.
  if (check.status !== "SUCCEEDED" && check.status !== "FAILED") return { applied: false, reason: "pending" as const };
  const outcome = await db.$transaction(async (tx) => {
    // skipDuplicates (ON CONFLICT DO NOTHING) rather than catching an error, which would abort the transaction.
    const fresh = await tx.paymentEvent.createMany({ data: [{ provider, eventKey: `${check.eventKey}:${check.status}`, type: eventType }], skipDuplicates: true });
    if (fresh.count === 0) return { applied: false, reason: "duplicate" as const };
    if (check.status === "FAILED") {
      await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failureReason: "Declined or abandoned at checkout" } });
      return { applied: false, reason: "failed" as const };
    }
    if (check.status !== "SUCCEEDED") return { applied: false, reason: "pending" as const };
    if (check.currency !== "GHS" || check.amountMinor < payment.amountMinor) {
      await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "FAILED", failureReason: `Amount or currency mismatch (${check.amountMinor} ${check.currency})` } });
      log.error("payment.amount_mismatch", { paymentId: payment.id, expected: payment.amountMinor, got: check.amountMinor, currency: check.currency });
      return { applied: false, reason: "mismatch" as const };
    }
    const claimed = await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "SUCCEEDED", verifiedAt: new Date() } });
    if (claimed.count === 0) return { applied: false, reason: "duplicate" as const };
    await recordPaymentReceived(tx, payment);
    const order = await tx.order.update({ where: { id: payment.orderId }, data: { amountPaidMinor: { increment: payment.amountMinor } } });
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: paymentStatusFor(order) } });
    await orderEvent(tx, order.id, "PAYMENT", null, "SYSTEM", `Payment of ${formatMoney(payment.amountMinor)} confirmed`, { paymentId: payment.id, provider });
    await advanceAfterPayment(tx, order.id);
    return { applied: true, reason: "ok" as const, order };
  });
  if (outcome.applied && "order" in outcome && outcome.order) {
    const o = outcome.order;
    if (["CANCELLED", "REFUNDED"].includes(o.status)) {
      // Paid after the order was cancelled (e.g. the checkout finished after the reservation expired).
      // The money is not ours to keep: refund it in full straight away.
      log.warn("payment.after_cancellation", { orderId: o.id, paymentId: payment.id });
      await issueRefund({ orderId: o.id, amountMinor: payment.amountMinor, reason: "Payment arrived after the order was cancelled", requestedById: o.customerId, decidedById: "system" });
      return outcome;
    }
    await notify(o.customerId, "payment.received", { amount: formatMoney(payment.amountMinor), order: o.number }, { link: `/orders/${o.id}`, orderId: o.id });
    if (o.businessId) await notifyBusiness(o.businessId, "payment.received.business", { amount: formatMoney(payment.amountMinor), order: o.number }, { link: `/biz/${o.businessId}/orders/${o.id}`, orderId: o.id });
    const { dispatchIfReady, announceAppointments } = await import("./deliveries");
    await dispatchIfReady(o.id);
    await announceAppointments(o.id);
  }
  return outcome;
}

/** Move the order on once the required payment has arrived. */
async function advanceAfterPayment(tx: Tx, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (o.status !== "AWAITING_PAYMENT" || o.amountPaidMinor < o.depositMinor) return;
  if (o.kind === "FABRIC") {
    await transition(tx, { orderId, from: "AWAITING_PAYMENT", to: "READY", actorId: null, as: "SYSTEM", note: "Paid" });
  } else if (o.measurementRecordId) {
    await transition(tx, { orderId, from: "AWAITING_PAYMENT", to: "MEASUREMENTS_CONFIRMED", actorId: null, as: "SYSTEM", note: "Paid; measurements already provided" });
  } else {
    await transition(tx, { orderId, from: "AWAITING_PAYMENT", to: "AWAITING_MEASUREMENTS", actorId: null, as: "SYSTEM", note: "Paid; waiting for measurements" });
  }
  // Paid reservations no longer expire.
  await tx.fabricReservation.updateMany({ where: { orderId, status: "ACTIVE" }, data: { expiresAt: null } });
}

/** Called when the customer returns from checkout. Verifies with the provider; never trusts the browser. */
export async function verifyByReference(reference: string) {
  const payment = await db.payment.findUnique({ where: { providerRef: reference } });
  if (!payment) return null;
  const provider = providerByName(payment.provider);
  if (!provider) return payment;
  const check = await provider.verify(reference);
  await applyConfirmedPayment(reference, check, provider.name, "verify");
  return db.payment.findUnique({ where: { providerRef: reference } });
}

/** Signed webhook from the provider. Throws on a bad signature. */
export async function handleWebhook(providerName: string, rawBody: string, headers: Headers) {
  const provider = providerByName(providerName);
  if (!provider) throw unavailable("Payments are not configured.");
  const event: WebhookEvent = provider.parseWebhook(rawBody, headers);
  if (event.kind === "charge") {
    return applyConfirmedPayment(event.reference, { status: event.status, amountMinor: event.amountMinor, currency: event.currency, eventKey: event.eventKey }, provider.name, "webhook.charge");
  }
  if (event.kind === "refund") {
    const refund = await db.refund.findFirst({ where: { providerRef: event.refundRef } });
    if (refund) await finishRefund(refund.id, event.status === "SUCCEEDED");
    return { applied: !!refund, reason: "refund" };
  }
  return { applied: false, reason: "ignored" };
}

/** Sandbox only: the person presses "Approve" on the sandbox checkout page. */
export async function approveSandboxPayment(actor: Actor, reference: string) {
  if (process.env.PAYMENTS_MODE !== "sandbox") throw invalid("Sandbox payments are switched off.");
  const payment = await db.payment.findUnique({ where: { providerRef: reference }, include: { order: true } });
  if (!payment || payment.provider !== "SANDBOX" || payment.order.customerId !== actor.userId) throw notFound("Payment");
  await db.paymentEvent.upsert({
    where: { provider_eventKey: { provider: "SANDBOX", eventKey: `approve:${reference}` } },
    create: { provider: "SANDBOX", eventKey: `approve:${reference}`, type: "sandbox.approve" },
    update: {},
  });
  await verifyByReference(reference);
  return payment.orderId;
}

// ───────────── Settlement ─────────────

/** Ledger settlement when an order completes. Called inside the completing transaction. */
export async function settleCompletedOrder(tx: Tx, orderId: string) {
  const o = await tx.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { acceptedQuotation: { include: { lines: true } }, appointments: true, deliveries: true },
  });
  if (!o.businessId) return;
  const settings = await getSettings();
  const visit = o.appointments.find((a) => a.status === "COMPLETED" && a.professionalId && a.kind === "HOME_VISIT");
  const lines = o.acceptedQuotation?.lines ?? [];
  const measurementLine = lines.filter((l) => l.kind === "MEASUREMENT").reduce((t, l) => t + l.amountMinor, 0);
  await settleOrder(tx, orderId, {
    businessId: o.businessId,
    // Delivery added after the quote is paid to riders; fabric-order delivery lines likewise.
    lines: lines.filter((l) => l.kind !== "DELIVERY" && l.kind !== "MEASUREMENT").map((l) => ({ kind: l.kind, amountMinor: l.amountMinor })),
    measurer: visit ? { userId: visit.professionalId!, feeMinor: measurementLine || visit.feeMinor } : undefined,
    riders: o.deliveries.filter((d) => d.status === "DELIVERED" && d.riderId).map((d) => ({ userId: d.riderId!, feeMinor: d.feeMinor, assignmentId: d.id })),
    commissionBps: settings.commissionBps,
  });
}

// ───────────── Refunds ─────────────

async function paymentsForRefund(orderId: string) {
  return db.payment.findMany({ where: { orderId, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" }, include: { refunds: true } });
}

/** Create and process a refund (provider call outside the DB transaction; ledger written on success). */
export async function issueRefund(p: { orderId: string; amountMinor: number; reason: string; requestedById: string; decidedById: string; disputeId?: string }) {
  const order = await db.order.findUniqueOrThrow({ where: { id: p.orderId } });
  const refundable = order.amountPaidMinor - order.amountRefundedMinor;
  if (p.amountMinor <= 0 || p.amountMinor > refundable) throw invalid(`You can refund up to ${formatMoney(refundable)}.`);
  // Spread the refund over successful payments, newest first.
  let left = p.amountMinor;
  const created = [];
  for (const pay of await paymentsForRefund(p.orderId)) {
    if (left <= 0) break;
    const already = pay.refunds.filter((r) => !["FAILED", "REJECTED"].includes(r.status)).reduce((t, r) => t + r.amountMinor, 0);
    const part = Math.min(left, pay.amountMinor - already);
    if (part <= 0) continue;
    left -= part;
    created.push(await db.refund.create({
      data: { orderId: p.orderId, paymentId: pay.id, amountMinor: part, reason: p.reason.slice(0, 500), status: "APPROVED", requestedById: p.requestedById, decidedById: p.decidedById, decidedAt: new Date(), disputeId: p.disputeId },
    }));
  }
  for (const r of created) await processRefund(r.id);
  return created;
}

async function processRefund(refundId: string) {
  const r = await db.refund.findUniqueOrThrow({ where: { id: refundId }, include: { payment: true } });
  if (r.status !== "APPROVED" || !r.payment) return;
  if (r.payment.provider === "LEGACY") {
    // V1 payments have no provider record to refund against; an administrator refunds by Mobile Money.
    await db.refund.update({ where: { id: r.id }, data: { status: "PROCESSING", processedAt: new Date() } });
    return;
  }
  const provider = providerByName(r.payment.provider);
  if (!provider) {
    await db.refund.update({ where: { id: r.id }, data: { status: "FAILED" } });
    return;
  }
  try {
    const res = await provider.refund({ reference: r.payment.providerRef, amountMinor: r.amountMinor });
    await db.refund.update({ where: { id: r.id }, data: { status: res.status === "SUCCEEDED" ? "APPROVED" : res.status, providerRef: res.providerRef, processedAt: new Date() } });
    if (res.status === "SUCCEEDED") await finishRefund(r.id, true);
  } catch (e) {
    log.error("refund.provider_failed", { refundId: r.id, error: e instanceof Error ? e.message : String(e) });
    await db.refund.update({ where: { id: r.id }, data: { status: "FAILED" } });
  }
}

/** Mark a refund done (or failed) and write the ledger. Safe to call twice. */
export async function finishRefund(refundId: string, succeeded: boolean) {
  const done = await db.$transaction(async (tx) => {
    const r = await tx.refund.findUniqueOrThrow({ where: { id: refundId }, include: { order: true } });
    if (r.status === "SUCCEEDED" || r.status === "FAILED") return null;
    if (!succeeded) {
      await tx.refund.update({ where: { id: r.id }, data: { status: "FAILED" } });
      return null;
    }
    const claimed = await tx.refund.updateMany({ where: { id: r.id, status: { in: ["APPROVED", "PROCESSING"] } }, data: { status: "SUCCEEDED", processedAt: new Date() } });
    if (claimed.count === 0) return null;
    await recordRefund(tx, { id: r.id, orderId: r.orderId, amountMinor: r.amountMinor }, r.order.businessId);
    const o = await tx.order.update({ where: { id: r.orderId }, data: { amountRefundedMinor: { increment: r.amountMinor } } });
    await tx.order.update({ where: { id: o.id }, data: { paymentStatus: paymentStatusFor(o) } });
    await orderEvent(tx, o.id, "PAYMENT", r.decidedById, "ADMIN", `Refund of ${formatMoney(r.amountMinor)} processed`, { refundId: r.id });
    return { order: o, amount: r.amountMinor };
  });
  if (done) await notify(done.order.customerId, "refund.processed", { amount: formatMoney(done.amount), order: done.order.number }, { link: `/orders/${done.order.id}`, orderId: done.order.id });
}

/** Admin confirms a manual (Mobile Money) refund for a legacy payment. */
export async function confirmManualRefund(actor: Actor, refundId: string, reference: string) {
  requireAdmin(actor, "FINANCE");
  if (!reference.trim()) throw invalid("Enter the Mobile Money transaction ID.");
  await db.refund.update({ where: { id: refundId }, data: { providerRef: reference.trim() } });
  await finishRefund(refundId, true);
  await audit(actor.userId, "refund.manual_confirm", { type: "Refund", id: refundId }, { reference });
}

/** Cancellation refund per policy: everything paid, less a measurement visit that already happened. */
export async function refundForCancellation(actor: Actor, orderId: string, reason: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { appointments: true } });
  const visit = o.appointments.find((a) => a.status === "COMPLETED" && a.kind === "HOME_VISIT");
  const keep = visit ? Math.min(visit.feeMinor, o.amountPaidMinor) : 0;
  const amount = o.amountPaidMinor - o.amountRefundedMinor - keep;
  if (amount > 0) await issueRefund({ orderId, amountMinor: amount, reason: `Cancellation: ${reason}`, requestedById: actor.userId, decidedById: actor.userId });
  if (keep > 0 && visit?.professionalId) {
    // Pay the professional for the visit that happened, from what's still held.
    await db.$transaction(async (tx) => {
      const held = await customerFundsHeld(tx, orderId);
      const fee = Math.min(keep, held);
      if (fee <= 0) return;
      await tx.ledgerEntry.createMany({
        data: [
          { account: "CUSTOMER_FUNDS", orderId, type: "SETTLEMENT", amountMinor: -fee, idempotencyKey: `cancel:${orderId}:funds`, memo: "Visit fee on cancellation" },
          { account: "PARTNER_PAYABLE", partyType: "USER", partyId: visit.professionalId!, orderId, type: "SETTLEMENT", amountMinor: fee, idempotencyKey: `cancel:${orderId}:measurer`, memo: "Measurement visit" },
        ],
        skipDuplicates: true,
      });
    });
  }
}

// ───────────── Payouts ─────────────

export async function recordPayoutForParty(actor: Actor, input: { partyType: "BUSINESS" | "USER"; partyId: string; amount: string; reference: string; destination: string }) {
  requireAdmin(actor, "FINANCE");
  const amount = parseCedis(input.amount);
  if (!amount || amount <= 0) throw invalid("Enter the amount sent.");
  if (!input.reference.trim()) throw invalid("Enter the Mobile Money transaction ID.");
  const payout = await db.$transaction(async (tx) => {
    const balance = await partyBalance(tx, input.partyType, input.partyId);
    if (amount > balance) throw conflict(`Only ${formatMoney(balance)} is owed.`);
    const p = await tx.payout.create({
      data: { partyType: input.partyType, partyId: input.partyId, amountMinor: amount, destination: input.destination, reference: input.reference.trim(), createdById: actor.userId },
    });
    await recordPayout(tx, { id: p.id, partyType: input.partyType, partyId: input.partyId, amountMinor: amount });
    await audit(actor.userId, "payout.record", { type: "Payout", id: p.id }, { partyType: input.partyType, partyId: input.partyId, amountMinor: amount }, tx);
    return p;
  });
  const vars = { amount: formatMoney(amount), reference: payout.reference };
  if (input.partyType === "BUSINESS") await notifyBusiness(input.partyId, "payout.sent", vars, { link: `/biz/${input.partyId}/finance` });
  else await notify(input.partyId, "payout.sent", vars, { link: "/pro/earnings" });
  return payout;
}

/** Money owed to each partner (positive balances), for the admin payouts page. */
export async function balancesOwed() {
  const rows = await db.ledgerEntry.groupBy({ by: ["partyType", "partyId"], where: { account: "PARTNER_PAYABLE" }, _sum: { amountMinor: true } });
  return rows.map((r) => ({ partyType: r.partyType as "BUSINESS" | "USER", partyId: r.partyId!, balanceMinor: r._sum.amountMinor ?? 0 })).filter((r) => r.balanceMinor !== 0);
}
