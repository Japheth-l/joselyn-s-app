import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Actor } from "@/server/actor";
import { requireOrderAccess } from "@/server/order-flow";
import { transition } from "@/server/order-flow";
import { decideVerification, setTemplate } from "@/server/services/admin";
import { setUserStatus } from "@/server/services/accounts";
import { acceptAppointment, submitAppointmentMeasurements } from "@/server/services/appointments";
import { changeStock, updateListing } from "@/server/services/catalogue";
import { conversationFor, openDispute, resolveDispute } from "@/server/services/community";
import { acceptDelivery, getAssignmentForRider, markDelivered, markPickedUp } from "@/server/services/deliveries";
import {
  acceptQuote, businessAdvance, chooseFulfilment, confirmCompletion, createCustomOrder, createFabricOrder,
  issuePickupCode, markCollected, sellerRespondFabricOrder, submitQuote,
} from "@/server/services/orders";
import { approveSandboxPayment, handleWebhook, recordPayoutForParty, startPayment } from "@/server/services/payments";
import { actorFor, ledgerTotal, makeBusiness, makeListing, makeStyle, makeUser, MEASUREMENTS, offerStyle, paidTotal, tomorrowPlus } from "../helpers";

// The 15 required scenarios (docs/V2_IMPLEMENTATION_PLAN.md). Scenario 15 (mobile overflow) is in e2e/.

async function payAll(customer: Actor, orderId: string, purpose: "DEPOSIT" | "BALANCE") {
  await startPayment(customer, orderId, purpose);
  const p = await db.payment.findFirstOrThrow({ where: { orderId, status: "PENDING" }, orderBy: { createdAt: "desc" } });
  await approveSandboxPayment(customer, p.providerRef);
  return p;
}

/** A custom order with self-entered measurements, quoted by `shop` using its own fabric, accepted. */
async function acceptedOrder(opts: { fabric?: boolean } = {}) {
  const { business, owner } = await makeBusiness();
  const style = await makeStyle();
  await offerStyle(business.id, style.id);
  const listing = await makeListing(business.id, 2000);
  const customer = await makeUser();
  const order = await createCustomOrder(customer, {
    styleId: style.id, fabricSource: opts.fabric === false ? "OWN" : "BUSINESS", measurementMethod: "SELF", measurements: MEASUREMENTS,
    businessIds: [business.id], designChoices: { sleeve: "Long" },
  });
  const q = await db.quotation.findFirstOrThrow({ where: { orderId: order.id } });
  await submitQuote(owner, q.id, {
    labour: "200", completionDate: tomorrowPlus(10), depositPercent: 50,
    ...(opts.fabric === false ? {} : { fabricListingId: listing.id, fabricQty: "6" }),
  });
  await acceptQuote(customer, q.id);
  return { business, owner, style, listing, customer, order, quotationId: q.id };
}

describe("1. Customer cannot access another customer's order", () => {
  it("returns not found for someone else's order, in services and messaging", async () => {
    const { order } = await acceptedOrder();
    const stranger = await makeUser();
    await expect(requireOrderAccess(db, stranger, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(conversationFor(stranger, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(startPayment(stranger, order.id, "DEPOSIT")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(issuePickupCode(stranger, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("2. Tailor cannot manage another business's inventory", () => {
  it("rejects stock and price changes on another business's listing", async () => {
    const a = await makeBusiness();
    const b = await makeBusiness();
    const listing = await makeListing(a.business.id, 1000);
    await expect(changeStock(b.owner, listing.id, { change: "5", type: "RESTOCK", note: "" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateListing(b.owner, listing.id, { price: "1", status: "INACTIVE" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const after = await db.fabricListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.qtyOnHandCenti).toBe(1000);
    expect(after.pricePerUnitMinor).toBe(listing.pricePerUnitMinor);
  });
});

describe("3. Unverified business cannot accept orders", () => {
  it("can't be asked for quotes, can't quote, can't fulfil", async () => {
    const { business, owner } = await makeBusiness({ verified: false });
    const style = await makeStyle();
    await offerStyle(business.id, style.id);
    const customer = await makeUser();
    await expect(createCustomOrder(customer, { styleId: style.id, fabricSource: "OWN", measurementMethod: "SELF", measurements: MEASUREMENTS, businessIds: [business.id] }))
      .rejects.toMatchObject({ code: "INVALID" });

    // Even if a request exists (e.g. verification was revoked after it was sent), quoting is refused.
    const verified = await makeBusiness();
    await offerStyle(verified.business.id, style.id);
    const order = await createCustomOrder(customer, { styleId: style.id, fabricSource: "OWN", measurementMethod: "SELF", measurements: MEASUREMENTS, businessIds: [verified.business.id] });
    await db.business.update({ where: { id: verified.business.id }, data: { verificationStatus: "SUSPENDED" } });
    const q = await db.quotation.findFirstOrThrow({ where: { orderId: order.id } });
    await expect(submitQuote(verified.owner, q.id, { labour: "100", completionDate: tomorrowPlus(5) })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(submitQuote(owner, q.id, { labour: "100", completionDate: tomorrowPlus(5) })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("4. Customer completes the full order workflow", () => {
  it("quote → deposit → production → pickup → balance → completion, with consistent money and stock", async () => {
    const { owner, listing, customer, order, business } = await acceptedOrder();
    let o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("AWAITING_PAYMENT");
    expect((await db.fabricListing.findUniqueOrThrow({ where: { id: listing.id } })).qtyReservedCenti).toBe(600);

    await payAll(customer, order.id, "DEPOSIT");
    o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("MEASUREMENTS_CONFIRMED");
    expect(o.paymentStatus).toBe("DEPOSIT_PAID");

    await businessAdvance(owner, order.id, "IN_PRODUCTION");
    const stock = await db.fabricListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(stock.qtyOnHandCenti).toBe(1400);
    expect(stock.qtyReservedCenti).toBe(0);
    await businessAdvance(owner, order.id, "QUALITY_CHECK");
    await businessAdvance(owner, order.id, "READY");

    await chooseFulfilment(customer, order.id, { fulfilment: "PICKUP" });
    const code = await issuePickupCode(customer, order.id);
    await expect(markCollected(owner, order.id, code)).rejects.toThrow(/balance/);
    await payAll(customer, order.id, "BALANCE");
    await expect(markCollected(owner, order.id, "000000" === code ? "111111" : "000000")).rejects.toThrow(/doesn't match/);
    await markCollected(owner, order.id, code);
    await confirmCompletion(customer, order.id);

    o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("COMPLETED");
    expect(o.paymentStatus).toBe("PAID");
    expect(o.amountPaidMinor).toBe(o.totalMinor);
    const held = await db.ledgerEntry.aggregate({ where: { orderId: order.id, account: "CUSTOMER_FUNDS" }, _sum: { amountMinor: true } });
    expect(held._sum.amountMinor).toBe(0);
    const payable = await db.ledgerEntry.aggregate({ where: { account: "PARTNER_PAYABLE", partyType: "BUSINESS", partyId: business.id }, _sum: { amountMinor: true } });
    const platform = await db.ledgerEntry.aggregate({ where: { orderId: order.id, account: "PLATFORM_REVENUE" }, _sum: { amountMinor: true } });
    expect((payable._sum.amountMinor ?? 0) + (platform._sum.amountMinor ?? 0)).toBe(o.totalMinor);
    expect(await ledgerTotal()).toBe(await paidTotal());

    const statuses = (await db.orderEvent.findMany({ where: { orderId: order.id, type: "STATUS" }, orderBy: { createdAt: "asc" } })).map((e) => e.toStatus);
    expect(statuses).toEqual(["QUOTE_REQUESTED", "QUOTED", "AWAITING_PAYMENT", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION", "QUALITY_CHECK", "READY", "COLLECTED", "COMPLETED"]);
  });
});

describe("5. Customer reuses measurements without a visit", () => {
  it("a saved record skips the visit and goes straight to MEASUREMENTS_CONFIRMED after payment", async () => {
    const { business, owner } = await makeBusiness();
    const style = await makeStyle();
    await offerStyle(business.id, style.id);
    const customer = await makeUser();
    const profile = await db.measurementProfile.create({ data: { ownerId: customer.userId, label: "Me" } });
    const rec = await db.measurementRecord.create({ data: { profileId: profile.id, revision: 1, values: MEASUREMENTS, source: "SELF", status: "CONFIRMED", createdById: customer.userId } });
    const order = await createCustomOrder(customer, { styleId: style.id, fabricSource: "OWN", measurementMethod: "SAVED", measurementRecordId: rec.id, businessIds: [business.id] });
    expect(await db.appointment.count({ where: { orderId: order.id } })).toBe(0);
    const q = await db.quotation.findFirstOrThrow({ where: { orderId: order.id } });
    await submitQuote(owner, q.id, { labour: "150", completionDate: tomorrowPlus(7) });
    await acceptQuote(customer, q.id);
    await payAll(customer, order.id, "DEPOSIT");
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("MEASUREMENTS_CONFIRMED");
    expect(o.measurementRecordId).toBe(rec.id);

    // Someone else's record can't be used.
    const other = await makeUser();
    await expect(createCustomOrder(other, { styleId: style.id, fabricSource: "OWN", measurementMethod: "SAVED", measurementRecordId: rec.id, businessIds: [business.id] }))
      .rejects.toMatchObject({ code: "INVALID" });
  });
});

describe("6. Measurement professional submits only for authorised appointments", () => {
  it("only the verified professional who accepted the visit can submit", async () => {
    const { business, owner } = await makeBusiness();
    const style = await makeStyle();
    await offerStyle(business.id, style.id);
    const customer = await makeUser();
    const start = new Date(Date.now() + 26 * 3_600_000);
    const local = (d: Date) => new Date(d.getTime()).toISOString().slice(0, 16);
    const order = await createCustomOrder(customer, {
      styleId: style.id, fabricSource: "OWN", measurementMethod: "HOME_VISIT", businessIds: [business.id],
      visitStart: local(start), visitEnd: local(new Date(start.getTime() + 2 * 3_600_000)), addressText: "Near the church", lat: 5.61, lng: -0.2,
    });
    const q = await db.quotation.findFirstOrThrow({ where: { orderId: order.id } });
    await submitQuote(owner, q.id, { labour: "150", completionDate: tomorrowPlus(9) });
    await acceptQuote(customer, q.id);
    const ap = await db.appointment.findFirstOrThrow({ where: { orderId: order.id } });

    const unverified = await makeUser({ agent: "MEASURER", agentStatus: "PENDING" });
    await expect(acceptAppointment(unverified, ap.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const pro = await makeUser({ agent: "MEASURER" });
    await expect(acceptAppointment(pro, ap.id)).rejects.toThrow(/isn't open yet/); // not paid yet
    await payAll(customer, order.id, "DEPOSIT");
    await acceptAppointment(pro, ap.id);

    const otherPro = await makeUser({ agent: "MEASURER" });
    await expect(submitAppointmentMeasurements(otherPro, ap.id, MEASUREMENTS, { draft: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(submitAppointmentMeasurements(customer, ap.id, MEASUREMENTS, { draft: false })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await submitAppointmentMeasurements(pro, ap.id, MEASUREMENTS, { draft: false });
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("MEASUREMENTS_CONFIRMED");
    expect(o.measurementRecordId).not.toBeNull();
  });
});

describe("7. Concurrent orders cannot oversell fabric", () => {
  it("ten simultaneous orders for the last 10 yards: exactly the stock is reserved", async () => {
    const { business } = await makeBusiness();
    const listing = await makeListing(business.id, 1000); // 10 yards
    const buyers = await Promise.all(Array.from({ length: 10 }, () => makeUser()));
    const results = await Promise.allSettled(buyers.map((b) => createFabricOrder(b, { listingId: listing.id, quantity: "3", fulfilment: "PICKUP" })));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    expect(ok).toBe(3);
    for (const r of results) if (r.status === "rejected") expect(r.reason).toMatchObject({ code: "CONFLICT" });
    const after = await db.fabricListing.findUniqueOrThrow({ where: { id: listing.id } });
    expect(after.qtyReservedCenti).toBe(900);
    expect(after.qtyOnHandCenti).toBe(1000);
    expect(after.qtyReservedCenti).toBeLessThanOrEqual(after.qtyOnHandCenti);
    const movements = await db.inventoryMovement.count({ where: { listingId: listing.id, type: "RESERVE" } });
    expect(movements).toBe(3);
  });
});

describe("8. Customer cannot mark their own payment confirmed", () => {
  it("returning from checkout without provider approval changes nothing; forged references are ignored", async () => {
    const { customer, order } = await acceptedOrder();
    await startPayment(customer, order.id, "DEPOSIT");
    const p = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });
    const { verifyByReference } = await import("@/server/services/payments");
    await verifyByReference(p.providerRef); // the callback page does this; provider says PENDING
    let o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.amountPaidMinor).toBe(0);
    expect(o.status).toBe("AWAITING_PAYMENT");

    // Another user can't approve this customer's sandbox payment.
    const stranger = await makeUser();
    await expect(approveSandboxPayment(stranger, p.providerRef)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // And the sandbox is refused entirely outside sandbox mode.
    process.env.PAYMENTS_MODE = "live";
    try {
      await expect(approveSandboxPayment(customer, p.providerRef)).rejects.toThrow(/switched off/);
    } finally {
      process.env.PAYMENTS_MODE = "sandbox";
    }
    // The earlier PENDING check must not block the real approval.
    await approveSandboxPayment(customer, p.providerRef);
    o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.amountPaidMinor).toBe(p.amountMinor);
  });
});

describe("9. Duplicate webhooks don't duplicate ledger entries", () => {
  it("applies a Paystack charge once, rejects bad signatures and short payments", async () => {
    const { order } = await acceptedOrder();
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit";
    try {
      const pay = await db.payment.create({ data: { orderId: order.id, purpose: "DEPOSIT", amountMinor: o.depositMinor, provider: "PAYSTACK", providerRef: `ref-${Date.now()}` } });
      const body = JSON.stringify({ event: "charge.success", data: { id: 99123, reference: pay.providerRef, amount: o.depositMinor, currency: "GHS" } });
      const sig = crypto.createHmac("sha512", "sk_test_unit").update(body).digest("hex");
      const headers = new Headers({ "x-paystack-signature": sig });
      await expect(handleWebhook("PAYSTACK", body, new Headers({ "x-paystack-signature": "bad" }))).rejects.toThrow(/signature/);

      const results = await Promise.all([handleWebhook("PAYSTACK", body, headers), handleWebhook("PAYSTACK", body, headers), handleWebhook("PAYSTACK", body, headers)]);
      expect(results.filter((r) => r.applied).length).toBe(1);
      expect(await db.ledgerEntry.count({ where: { paymentId: pay.id } })).toBe(1);
      const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.amountPaidMinor).toBe(o.depositMinor);

      // An underpayment is never treated as paid.
      const order2 = (await acceptedOrder()).order;
      const o2 = await db.order.findUniqueOrThrow({ where: { id: order2.id } });
      const pay2 = await db.payment.create({ data: { orderId: order2.id, purpose: "DEPOSIT", amountMinor: o2.depositMinor, provider: "PAYSTACK", providerRef: `ref2-${Date.now()}` } });
      const body2 = JSON.stringify({ event: "charge.success", data: { id: 99124, reference: pay2.providerRef, amount: o2.depositMinor - 1, currency: "GHS" } });
      await handleWebhook("PAYSTACK", body2, new Headers({ "x-paystack-signature": crypto.createHmac("sha512", "sk_test_unit").update(body2).digest("hex") }));
      expect((await db.payment.findUniqueOrThrow({ where: { id: pay2.id } })).status).toBe("FAILED");
      expect((await db.order.findUniqueOrThrow({ where: { id: order2.id } })).amountPaidMinor).toBe(0);
    } finally {
      delete process.env.PAYSTACK_SECRET_KEY;
    }
    expect(await ledgerTotal()).toBe(await paidTotal());
  });
});

describe("10. Order cannot jump between states", () => {
  it("rejects skipped steps and stale transitions", async () => {
    const { owner, order, customer } = await acceptedOrder();
    // AWAITING_PAYMENT → IN_PRODUCTION skips payment and measurements.
    await expect(businessAdvance(owner, order.id, "IN_PRODUCTION")).rejects.toBeTruthy();
    await expect(businessAdvance(owner, order.id, "READY")).rejects.toBeTruthy();
    await expect(db.$transaction((tx) => transition(tx, { orderId: order.id, from: "AWAITING_PAYMENT", to: "COMPLETED", actorId: customer.userId, as: "CUSTOMER" }))).rejects.toBeTruthy();
    // A transition from a status the order is no longer in (a stale page) fails.
    await expect(db.$transaction((tx) => transition(tx, { orderId: order.id, from: "QUOTED", to: "AWAITING_PAYMENT", actorId: customer.userId, as: "CUSTOMER" }))).rejects.toBeTruthy();
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("AWAITING_PAYMENT");
    await expect(confirmCompletion(customer, order.id)).rejects.toBeTruthy();
  });
});

describe("11. Unassigned rider cannot access a delivery", () => {
  it("only the assigned rider sees details and completes it, and only with the customer's code", async () => {
    const { owner, customer, order } = await acceptedOrder({ fabric: false });
    await payAll(customer, order.id, "DEPOSIT");
    for (const s of ["IN_PRODUCTION", "QUALITY_CHECK", "READY"] as const) await businessAdvance(owner, order.id, s);
    await chooseFulfilment(customer, order.id, { fulfilment: "DELIVERY", addressText: "House 4, Osu", lat: 5.556, lng: -0.182 });
    let leg = await db.deliveryAssignment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(leg.status).toBe("PENDING_PAYMENT"); // not dispatched before the balance is paid
    await payAll(customer, order.id, "BALANCE");
    leg = await db.deliveryAssignment.findFirstOrThrow({ where: { orderId: order.id, status: "OPEN" } });

    const rider = await makeUser({ agent: "RIDER" });
    const other = await makeUser({ agent: "RIDER" });
    await expect(getAssignmentForRider(rider, leg.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await acceptDelivery(rider, leg.id);
    await expect(acceptDelivery(other, leg.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(getAssignmentForRider(other, leg.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(markPickedUp(other, leg.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(conversationFor(other, order.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await markPickedUp(rider, leg.id);
    await expect(markDelivered(rider, leg.id, "abcdef")).rejects.toThrow(/doesn't match/);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PICKED_UP");
  });
});

describe("12. Refund and ledger stay consistent", () => {
  it("cancellation refunds, dispute refunds and payouts keep ledger == payments and never overpay", async () => {
    // Cancellation after deposit: full refund.
    const a = await acceptedOrder();
    await payAll(a.customer, a.order.id, "DEPOSIT");
    const { cancelOrder } = await import("@/server/services/orders");
    await cancelOrder(a.customer, a.order.id, "Changed my mind");
    let o = await db.order.findUniqueOrThrow({ where: { id: a.order.id } });
    expect(o.status).toBe("CANCELLED");
    expect(o.amountRefundedMinor).toBe(o.amountPaidMinor);
    expect(o.paymentStatus).toBe("REFUNDED");
    expect((await db.fabricListing.findUniqueOrThrow({ where: { id: a.listing.id } })).qtyReservedCenti).toBe(0);
    const held = await db.ledgerEntry.aggregate({ where: { orderId: a.order.id, account: "CUSTOMER_FUNDS" }, _sum: { amountMinor: true } });
    expect(held._sum.amountMinor).toBe(0);

    // Dispute after completion: partial refund taken from the business's balance.
    const b = await acceptedOrder();
    await payAll(b.customer, b.order.id, "DEPOSIT");
    for (const s of ["IN_PRODUCTION", "QUALITY_CHECK", "READY"] as const) await businessAdvance(b.owner, b.order.id, s);
    await chooseFulfilment(b.customer, b.order.id, { fulfilment: "PICKUP" });
    await payAll(b.customer, b.order.id, "BALANCE");
    await markCollected(b.owner, b.order.id, await issuePickupCode(b.customer, b.order.id));
    await confirmCompletion(b.customer, b.order.id);
    const dispute = await openDispute(b.customer, b.order.id, "NOT_AS_AGREED", "The stitching on the left sleeve came apart on first wear.");
    const admin = await makeUser({ roles: ["ADMIN"], adminPermissions: ["DISPUTES", "FINANCE"] });
    await resolveDispute(admin, dispute.id, { remedy: "PARTIAL_REFUND", refundAmount: "50", resolution: "Partial refund for repair", orderOutcome: "RESUME" });
    o = await db.order.findUniqueOrThrow({ where: { id: b.order.id } });
    expect(o.status).toBe("COMPLETED");
    expect(o.amountRefundedMinor).toBe(5000);
    expect(o.paymentStatus).toBe("PARTIALLY_REFUNDED");

    // Payout: can't pay out more than is owed.
    const owed = await db.ledgerEntry.aggregate({ where: { account: "PARTNER_PAYABLE", partyType: "BUSINESS", partyId: b.business.id }, _sum: { amountMinor: true } });
    const balance = owed._sum.amountMinor ?? 0;
    expect(balance).toBeGreaterThan(0);
    await expect(recordPayoutForParty(admin, { partyType: "BUSINESS", partyId: b.business.id, amount: String(balance / 100 + 1), reference: "MM1", destination: "024" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await recordPayoutForParty(admin, { partyType: "BUSINESS", partyId: b.business.id, amount: String(balance / 100), reference: "MM2", destination: "024" });
    const after = await db.ledgerEntry.aggregate({ where: { account: "PARTNER_PAYABLE", partyType: "BUSINESS", partyId: b.business.id }, _sum: { amountMinor: true } });
    expect(after._sum.amountMinor).toBe(0);

    expect(await ledgerTotal()).toBe(await paidTotal());
  });
});

describe("13. Self-pickup creates no delivery assignment", () => {
  it("pickup orders never create a delivery leg, and switching from delivery to pickup cancels it", async () => {
    const { owner, customer, order } = await acceptedOrder({ fabric: false });
    await payAll(customer, order.id, "DEPOSIT");
    for (const s of ["IN_PRODUCTION", "QUALITY_CHECK", "READY"] as const) await businessAdvance(owner, order.id, s);
    const before = (await db.order.findUniqueOrThrow({ where: { id: order.id } })).totalMinor;
    await chooseFulfilment(customer, order.id, { fulfilment: "DELIVERY", addressText: "Osu", lat: 5.556, lng: -0.182 });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).totalMinor).toBeGreaterThan(before);
    await chooseFulfilment(customer, order.id, { fulfilment: "PICKUP" });
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.totalMinor).toBe(before);
    expect(await db.deliveryAssignment.count({ where: { orderId: order.id, status: { not: "CANCELLED" } } })).toBe(0);

    // Fabric order with pickup: confirmed, paid, collected; no delivery leg at any point.
    const { business, owner: seller } = await makeBusiness();
    const listing = await makeListing(business.id, 1000);
    const buyer = await makeUser();
    const fo = await createFabricOrder(buyer, { listingId: listing.id, quantity: "2", fulfilment: "PICKUP" });
    await sellerRespondFabricOrder(seller, fo.id, true);
    await payAll(buyer, fo.id, "DEPOSIT");
    expect((await db.order.findUniqueOrThrow({ where: { id: fo.id } })).status).toBe("READY");
    await markCollected(seller, fo.id, await issuePickupCodeFabric(buyer, fo.id));
    expect(await db.deliveryAssignment.count({ where: { orderId: fo.id } })).toBe(0);
    expect((await db.fabricListing.findUniqueOrThrow({ where: { id: listing.id } })).qtyOnHandCenti).toBe(800);
  });
});

async function issuePickupCodeFabric(customer: Actor, orderId: string) {
  return issuePickupCode(customer, orderId);
}

describe("14. Admin sensitive actions are audited and permission-checked", () => {
  it("records an audit event for each sensitive action and refuses admins without the permission", async () => {
    const { business } = await makeBusiness({ verified: false });
    const app = await db.verificationApplication.create({ data: { subjectType: "BUSINESS", applicantId: (await makeUser()).userId, businessId: business.id } });
    const support = await makeUser({ roles: ["ADMIN"], adminPermissions: ["DISPUTES"] });
    await expect(decideVerification(support, app.id, { decision: "APPROVED" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const verifier = await makeUser({ roles: ["ADMIN"], adminPermissions: ["VERIFY"] });
    await decideVerification(verifier, app.id, { decision: "APPROVED" });
    expect((await db.business.findUniqueOrThrow({ where: { id: business.id } })).verificationStatus).toBe("VERIFIED");
    expect(await db.auditEvent.count({ where: { entityId: app.id, actorId: verifier.userId } })).toBe(1);

    const userAdmin = await makeUser({ roles: ["ADMIN"], adminPermissions: ["USERS"] });
    const target = await makeUser();
    await setUserStatus(userAdmin, target.userId, "SUSPENDED", "Fraud report");
    expect(await db.auditEvent.count({ where: { entityId: target.userId, action: { contains: "suspend" } } })).toBeGreaterThanOrEqual(1);
    const suspended = await db.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(suspended.status).toBe("SUSPENDED");
    // Suspension revokes sessions: the old session version no longer loads.
    const { loadActor } = await import("@/server/actor");
    expect(await loadActor(target.userId, 0)).toBeNull();

    await expect(setTemplate(verifier, "order.status", "x")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const config = await makeUser({ roles: ["ADMIN"], adminPermissions: ["CONFIG"] });
    await expect(setTemplate(config, "order.status", "Order {{order}} {{secret}}")).rejects.toThrow(/Unknown placeholder/);
    await setTemplate(config, "order.status", "Order #{{order}} is now {{status}}.");
    expect(await db.auditEvent.count({ where: { action: "template.updated", actorId: config.userId } })).toBe(1);
    await db.notificationTemplate.deleteMany({ where: { key: "order.status" } });

    // A plain customer is never an admin.
    const customer = await actorFor((await makeUser()).userId);
    await expect(decideVerification(customer, app.id, { decision: "REJECTED", note: "x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
