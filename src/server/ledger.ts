import type { Prisma } from "@prisma/client";
import { bpsOf } from "@/lib/money";
import { conflict, invalid } from "./errors";

type Tx = Prisma.TransactionClient;

/*
 * Append-only money ledger, in pesewas.
 *
 * Money comes in only through PAYMENT_RECEIVED (+CUSTOMER_FUNDS). Every other event moves value between
 * accounts and nets to zero, so at all times:
 *     sum(all ledger entries) == sum(successful payments)
 * Each entry has a unique idempotencyKey, so replaying an event (a duplicate webhook, a retried
 * request) can never write the same money twice.
 */

type Entry = {
  account: "CUSTOMER_FUNDS" | "PLATFORM_REVENUE" | "PARTNER_PAYABLE" | "REFUNDS" | "PAYOUTS";
  partyType?: "BUSINESS" | "USER";
  partyId?: string;
  type: string;
  amountMinor: number;
  key: string;
  memo?: string;
};

async function write(tx: Tx, refs: { orderId?: string; paymentId?: string; refundId?: string; payoutId?: string }, entries: Entry[]) {
  const total = entries.reduce((t, e) => t + e.amountMinor, 0);
  if (entries.some((e) => !Number.isInteger(e.amountMinor))) throw new Error("Ledger amounts must be integer pesewas");
  // Only PAYMENT_RECEIVED adds money; everything else must balance.
  if (!entries.every((e) => e.type === "PAYMENT_RECEIVED") && total !== 0) throw new Error(`Unbalanced ledger write (${total})`);
  for (const e of entries.filter((x) => x.amountMinor !== 0)) {
    await tx.ledgerEntry.upsert({
      where: { idempotencyKey: e.key },
      create: {
        account: e.account, partyType: e.partyType, partyId: e.partyId, type: e.type, amountMinor: e.amountMinor,
        idempotencyKey: e.key, memo: e.memo ?? "", ...refs,
      },
      update: {},
    });
  }
}

export async function recordPaymentReceived(tx: Tx, payment: { id: string; orderId: string; amountMinor: number }) {
  await write(tx, { orderId: payment.orderId, paymentId: payment.id }, [
    { account: "CUSTOMER_FUNDS", type: "PAYMENT_RECEIVED", amountMinor: payment.amountMinor, key: `payment:${payment.id}`, memo: "Payment received" },
  ]);
}

/** Money currently held for an order (paid in, not yet settled or refunded). */
export async function customerFundsHeld(tx: Tx, orderId: string) {
  const agg = await tx.ledgerEntry.aggregate({ where: { orderId, account: "CUSTOMER_FUNDS" }, _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0;
}

export async function partyBalance(tx: Tx, partyType: "BUSINESS" | "USER", partyId: string) {
  const agg = await tx.ledgerEntry.aggregate({ where: { account: "PARTNER_PAYABLE", partyType, partyId }, _sum: { amountMinor: true } });
  return agg._sum.amountMinor ?? 0;
}

export type SettlementPlan = {
  businessId: string;
  lines: { kind: string; amountMinor: number }[];
  measurer?: { userId: string; feeMinor: number };
  riders: { userId: string; feeMinor: number; assignmentId: string }[];
  commissionBps: number;
};

/**
 * Settle a completed order: move what is held for it to the business, the measurement professional,
 * riders and the platform. Partial refunds made earlier come out of the business's share.
 */
export async function settleOrder(tx: Tx, orderId: string, plan: SettlementPlan) {
  const held = await customerFundsHeld(tx, orderId);
  if (held <= 0) return { held, entries: 0 };
  const serviceFee = plan.lines.filter((l) => l.kind === "SERVICE_FEE").reduce((t, l) => t + l.amountMinor, 0);
  const commissionBase = plan.lines.filter((l) => ["LABOUR", "FABRIC", "OTHER", "DISCOUNT"].includes(l.kind)).reduce((t, l) => t + l.amountMinor, 0);
  const measurerFee = plan.measurer?.feeMinor ?? 0;
  const riderFees = plan.riders.reduce((t, r) => t + r.feeMinor, 0);

  // Pay partners in this order of priority; if less is held than expected (after refunds), the business share shrinks.
  let remaining = held;
  const take = (want: number) => {
    const got = Math.max(0, Math.min(want, remaining));
    remaining -= got;
    return got;
  };
  const platformFee = take(serviceFee);
  const measurerPay = take(measurerFee);
  const riderPays = plan.riders.map((r) => ({ ...r, pay: take(r.feeMinor) }));
  const businessGross = remaining;
  const commission = Math.min(businessGross, bpsOf(Math.max(0, commissionBase), plan.commissionBps));
  const businessNet = businessGross - commission;

  const entries: Entry[] = [
    { account: "CUSTOMER_FUNDS", type: "SETTLEMENT", amountMinor: -held, key: `settle:${orderId}:funds`, memo: "Order completed" },
    { account: "PARTNER_PAYABLE", partyType: "BUSINESS", partyId: plan.businessId, type: "SETTLEMENT", amountMinor: businessNet, key: `settle:${orderId}:business`, memo: "Sewing and fabric, less commission" },
    { account: "PLATFORM_REVENUE", type: "COMMISSION", amountMinor: commission, key: `settle:${orderId}:commission`, memo: "Commission" },
    { account: "PLATFORM_REVENUE", type: "SERVICE_FEE", amountMinor: platformFee, key: `settle:${orderId}:service-fee`, memo: "Customer service fee" },
  ];
  if (plan.measurer && measurerPay > 0) {
    entries.push({ account: "PARTNER_PAYABLE", partyType: "USER", partyId: plan.measurer.userId, type: "SETTLEMENT", amountMinor: measurerPay, key: `settle:${orderId}:measurer`, memo: "Measurement visit" });
  }
  for (const r of riderPays) {
    if (r.pay > 0) entries.push({ account: "PARTNER_PAYABLE", partyType: "USER", partyId: r.userId, type: "SETTLEMENT", amountMinor: r.pay, key: `settle:${orderId}:rider:${r.assignmentId}`, memo: "Delivery" });
  }
  await write(tx, { orderId }, entries);
  return { held, entries: entries.length, businessNet, commission, platformFee, measurerPay, riderPay: riderPays.reduce((t, r) => t + r.pay, 0), riderFees };
}

/**
 * Record a refund. Before settlement it comes from the funds held for the order; after settlement it is
 * recovered from the business's balance (which may go negative and is netted against future earnings).
 */
export async function recordRefund(tx: Tx, refund: { id: string; orderId: string; amountMinor: number }, businessId: string | null) {
  if (refund.amountMinor <= 0) throw invalid("Refund amount must be above zero.");
  const held = await customerFundsHeld(tx, refund.orderId);
  const fromHeld = Math.min(held, refund.amountMinor);
  const fromBusiness = refund.amountMinor - fromHeld;
  if (fromBusiness > 0 && !businessId) throw conflict("This refund is larger than the money held for the order.");
  const entries: Entry[] = [
    { account: "CUSTOMER_FUNDS", type: "REFUND", amountMinor: -fromHeld, key: `refund:${refund.id}:funds` },
    { account: "REFUNDS", type: "REFUND", amountMinor: refund.amountMinor, key: `refund:${refund.id}:out`, memo: "Refunded to customer" },
  ];
  if (fromBusiness > 0) {
    entries.push({ account: "PARTNER_PAYABLE", partyType: "BUSINESS", partyId: businessId!, type: "REFUND", amountMinor: -fromBusiness, key: `refund:${refund.id}:business`, memo: "Refund recovered after settlement" });
  }
  await write(tx, { orderId: refund.orderId, refundId: refund.id }, entries);
}

export async function recordPayout(tx: Tx, payout: { id: string; partyType: "BUSINESS" | "USER"; partyId: string; amountMinor: number }) {
  const balance = await partyBalance(tx, payout.partyType, payout.partyId);
  if (payout.amountMinor <= 0) throw invalid("Payout amount must be above zero.");
  if (payout.amountMinor > balance) throw conflict("The payout is larger than the amount owed.");
  await write(tx, { payoutId: payout.id }, [
    { account: "PARTNER_PAYABLE", partyType: payout.partyType, partyId: payout.partyId, type: "PAYOUT", amountMinor: -payout.amountMinor, key: `payout:${payout.id}:debit` },
    { account: "PAYOUTS", type: "PAYOUT", amountMinor: payout.amountMinor, key: `payout:${payout.id}:credit`, memo: "Sent by Mobile Money" },
  ]);
}
