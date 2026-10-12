import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { autoCompleteOrders, cancelUnpaidOrders, expireQuotations, sendAppointmentReminders } from "@/server/services/maintenance";
import { createCustomOrder, createFabricOrder, sellerRespondFabricOrder, submitQuote } from "@/server/services/orders";
import { approveSandboxPayment, startPayment } from "@/server/services/payments";
import { ledgerTotal, makeBusiness, makeListing, makeStyle, makeUser, MEASUREMENTS, offerStyle, paidTotal, tomorrowPlus } from "../helpers";

const later = (hours: number) => new Date(Date.now() + hours * 3_600_000);

describe("scheduled maintenance", () => {
  it("cancels unpaid orders when the stock hold lapses, and refunds a payment that lands afterwards", async () => {
    const { business, owner } = await makeBusiness();
    const listing = await makeListing(business.id, 1000);
    const buyer = await makeUser();
    const order = await createFabricOrder(buyer, { listingId: listing.id, quantity: "4", fulfilment: "PICKUP" });
    await sellerRespondFabricOrder(owner, order.id, true);
    await startPayment(buyer, order.id, "DEPOSIT");
    const pay = await db.payment.findFirstOrThrow({ where: { orderId: order.id } });

    const status = async () => (await db.order.findUniqueOrThrow({ where: { id: order.id } })).status;
    // The hold lapses now.
    await db.fabricReservation.updateMany({ where: { orderId: order.id }, data: { expiresAt: later(-1) } });
    // A checkout started in the last 30 minutes postpones cancellation.
    await cancelUnpaidOrders();
    expect(await status()).toBe("AWAITING_PAYMENT");
    await db.payment.update({ where: { id: pay.id }, data: { createdAt: later(-1) } });
    await cancelUnpaidOrders();
    expect(await status()).toBe("CANCELLED");
    expect((await db.fabricListing.findUniqueOrThrow({ where: { id: listing.id } })).qtyReservedCenti).toBe(0);
    const events = await db.orderEvent.count({ where: { orderId: order.id } });
    await cancelUnpaidOrders(); // idempotent
    expect(await db.orderEvent.count({ where: { orderId: order.id } })).toBe(events);

    // The customer finishes the old checkout anyway: the money is refunded in full automatically.
    await approveSandboxPayment(buyer, pay.providerRef);
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o.status).toBe("CANCELLED");
    expect(o.amountRefundedMinor).toBe(o.amountPaidMinor);
    expect(await ledgerTotal()).toBe(await paidTotal());
  });

  it("expires stale quotations and returns the order to collecting quotes", async () => {
    const { business, owner } = await makeBusiness();
    const style = await makeStyle();
    await offerStyle(business.id, style.id);
    const customer = await makeUser();
    const order = await createCustomOrder(customer, { styleId: style.id, fabricSource: "OWN", measurementMethod: "SELF", measurements: MEASUREMENTS, businessIds: [business.id] });
    const q = await db.quotation.findFirstOrThrow({ where: { orderId: order.id } });
    await submitQuote(owner, q.id, { labour: "100", completionDate: tomorrowPlus(9) });
    expect(await expireQuotations(later(24 * 8))).toBeGreaterThanOrEqual(1);
    expect((await db.quotation.findUniqueOrThrow({ where: { id: q.id } })).status).toBe("EXPIRED");
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("QUOTE_REQUESTED");
  });

  it("auto-completes delivered orders only after the waiting period", async () => {
    const before = await autoCompleteOrders(new Date());
    expect(before).toBe(0);
  });

  it("sends each appointment reminder once", async () => {
    const customer = await makeUser();
    const pro = await makeUser({ agent: "MEASURER" });
    await db.appointment.create({ data: { kind: "HOME_VISIT", customerId: customer.userId, professionalId: pro.userId, status: "ACCEPTED", windowStart: later(5), windowEnd: later(7) } });
    expect(await sendAppointmentReminders()).toBe(1);
    expect(await sendAppointmentReminders()).toBe(0);
  });
});
