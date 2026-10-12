"use server";

import { redirect } from "next/navigation";
import { run, type ActionResult } from "@/server/action";
import { list, optNum, optStr, str } from "@/server/forms";
import { saveUploads } from "@/server/files";
import { parseMeasurementForm } from "@/server/services/measurements";
import * as orders from "@/server/services/orders";
import * as payments from "@/server/services/payments";
import * as deliveries from "@/server/services/deliveries";
import * as appointments from "@/server/services/appointments";
import * as community from "@/server/services/community";

// Customer-side order actions. Every service re-checks that the actor may do this.

export async function createCustomOrderAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let orderId = "";
  const res = await run(async (actor) => {
    const method = str(fd, "measurementMethod") as "SAVED" | "SELF" | "HOME_VISIT" | "AT_WORKSHOP";
    const refs = await saveUploads(actor, fd.getAll("reference"), { purpose: "REFERENCE" }, 5);
    const designChoices: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("opt_") && typeof v === "string" && v) designChoices[k.slice(4)] = v;
    const order = await orders.createCustomOrder(actor, {
      styleId: str(fd, "styleId"),
      designChoices,
      instructions: str(fd, "instructions"),
      referenceFileIds: refs.map((r) => r.id),
      budget: optStr(fd, "budget"),
      neededBy: optStr(fd, "neededBy"),
      fabricSource: str(fd, "fabricSource") as "OWN" | "BUSINESS" | "SELLER",
      measurementMethod: method,
      measurementRecordId: optStr(fd, "measurementRecordId"),
      measurements: method === "SELF" ? parseMeasurementForm(fd, (str(fd, "unit") || "in") as "in" | "cm") : undefined,
      visitStart: optStr(fd, "visitStart"),
      visitEnd: optStr(fd, "visitEnd"),
      addressText: optStr(fd, "addressText"),
      lat: optNum(fd, "lat"),
      lng: optNum(fd, "lng"),
      businessIds: list(fd, "businessIds"),
    });
    orderId = order.id;
  });
  if (orderId) redirect(`/orders/${orderId}?created=1`);
  return res;
}

const id = (fd: FormData) => str(fd, "orderId");

export async function acceptQuoteAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await orders.acceptQuote(a, str(fd, "quotationId")); return "Quote accepted. Pay the deposit to start."; });
}
export async function requestMoreQuotesAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await orders.requestMoreQuotes(a, id(fd), list(fd, "businessIds")); return "Request sent."; });
}
export async function decideRevisionAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const approve = str(fd, "decision") === "approve";
    await orders.decideRevision(a, str(fd, "revisionId"), approve);
    return approve ? "Change approved." : "You kept the original quote.";
  });
}
export async function cancelOrderAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await orders.cancelOrder(a, id(fd), str(fd, "reason") || "Cancelled by customer"); return "Order cancelled."; });
}

export async function payAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let url = "";
  const res = await run(async (a) => { url = await payments.startPayment(a, id(fd), str(fd, "purpose") === "BALANCE" ? "BALANCE" : "DEPOSIT"); });
  if (url) redirect(url);
  return res;
}

export async function approveSandboxAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let orderId = "";
  const res = await run(async (a) => { orderId = await payments.approveSandboxPayment(a, str(fd, "reference")); });
  if (orderId) redirect(`/orders/${orderId}?payment=success`);
  return res;
}

export async function chooseFulfilmentAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const f = str(fd, "fulfilment") === "DELIVERY" ? "DELIVERY" : "PICKUP";
    await orders.chooseFulfilment(a, id(fd), { fulfilment: f, addressText: optStr(fd, "addressText"), lat: optNum(fd, "lat"), lng: optNum(fd, "lng") });
    return f === "PICKUP" ? "You'll collect it. Show your pickup code at the workshop." : "Delivery chosen.";
  });
}

export async function pickupCodeAction(_: ActionResult, fd: FormData) {
  return run(async (a) => `Your pickup code is ${await orders.issuePickupCode(a, id(fd))}. Show it only when you collect your order.`);
}
export async function deliveryCodeAction(_: ActionResult, fd: FormData) {
  return run(async (a) => `Your new delivery code is ${await deliveries.reissueDeliveryCode(a, id(fd))}. Give it to the rider only when you have your order.`);
}
export async function confirmLegacyDeliveryAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await deliveries.customerConfirmsLegacyDelivery(a, id(fd)); return "Thanks for confirming."; });
}
export async function retryDeliveryAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await deliveries.reopenDelivery(a, id(fd)); return "We're looking for another rider."; });
}
export async function confirmCompletionAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await orders.confirmCompletion(a, id(fd)); return "Order complete. Thank you!"; });
}
export async function rescheduleVisitAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await appointments.rescheduleAppointment(a, id(fd), str(fd, "start"), str(fd, "end")); return "Visit time updated."; });
}
export async function bookWorkshopVisitAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await appointments.bookWorkshopVisit(a, id(fd), str(fd, "start")); return "Workshop visit booked."; });
}
export async function confirmMeasurementsAction(_: ActionResult, fd: FormData) {
  const { confirmRecord } = await import("@/server/services/measurements");
  return run(async (a) => { await confirmRecord(a, str(fd, "recordId")); return "Measurements confirmed."; });
}
export async function reviewAction(_: ActionResult, fd: FormData) {
  return run(async (a) => { await community.submitReview(a, id(fd), Number(str(fd, "rating")), str(fd, "comment")); return "Thank you for your review."; });
}
export async function sendMessageAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const files = await saveUploads(a, fd.getAll("photo"), { purpose: "MESSAGE", orderId: id(fd) }, 3);
    await community.sendMessage(a, id(fd), str(fd, "body"), files.map((f) => f.id));
    return "Sent.";
  });
}
export async function openDisputeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let disputeId = "";
  const res = await run(async (a) => {
    const files = await saveUploads(a, fd.getAll("evidence"), { purpose: "DISPUTE", orderId: id(fd), allowPdf: true }, 5);
    disputeId = (await community.openDispute(a, id(fd), str(fd, "category"), str(fd, "description"), files.map((f) => f.id))).id;
  });
  if (disputeId) redirect(`/support/disputes/${disputeId}`);
  return res;
}

export async function buyFabricAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let orderId = "";
  const res = await run(async (a) => {
    orderId = (await orders.createFabricOrder(a, {
      listingId: str(fd, "listingId"), quantity: str(fd, "quantity"), fulfilment: str(fd, "fulfilment") === "DELIVERY" ? "DELIVERY" : "PICKUP",
      addressText: optStr(fd, "addressText"), lat: optNum(fd, "lat"), lng: optNum(fd, "lng"), forOrderId: optStr(fd, "forOrderId"),
    })).id;
  });
  if (orderId) redirect(`/orders/${orderId}?created=1`);
  return res;
}
