import type { OrderStatus } from "@/lib/enums";
import type { OrderRelation } from "./authz";

/**
 * The order state machine. Every status change must be one of these transitions.
 * `by` lists who may trigger it; `when` describes extra conditions checked by the service
 * that performs the transition (payment, measurements, proof of delivery, ...).
 */
export type Transition = { from: OrderStatus[]; to: OrderStatus; by: (OrderRelation | "SYSTEM")[]; when?: string };

export const TRANSITIONS: Transition[] = [
  { from: ["DRAFT"], to: "QUOTE_REQUESTED", by: ["CUSTOMER"] },
  { from: ["QUOTE_REQUESTED"], to: "QUOTED", by: ["BUSINESS", "SYSTEM"], when: "a business submitted a quotation" },
  { from: ["QUOTED"], to: "QUOTE_REQUESTED", by: ["SYSTEM"], when: "every submitted quotation was declined or expired" },
  { from: ["QUOTE_REQUESTED", "QUOTED"], to: "AWAITING_PAYMENT", by: ["CUSTOMER", "BUSINESS"], when: "the customer accepted a quotation (fabric orders: the seller confirmed)" },
  { from: ["AWAITING_PAYMENT"], to: "AWAITING_MEASUREMENTS", by: ["SYSTEM"], when: "the required payment arrived and measurements are still needed" },
  { from: ["AWAITING_PAYMENT"], to: "MEASUREMENTS_CONFIRMED", by: ["SYSTEM"], when: "the required payment arrived and measurements are attached" },
  { from: ["AWAITING_PAYMENT"], to: "READY", by: ["SYSTEM"], when: "fabric order paid" },
  { from: ["AWAITING_MEASUREMENTS"], to: "MEASUREMENTS_CONFIRMED", by: ["BUSINESS", "SYSTEM"], when: "a measurement record is attached" },
  { from: ["MEASUREMENTS_CONFIRMED"], to: "AWAITING_MEASUREMENTS", by: ["BUSINESS"], when: "the business needs new measurements" },
  { from: ["MEASUREMENTS_CONFIRMED"], to: "IN_PRODUCTION", by: ["BUSINESS"], when: "deposit paid; reserved fabric is deducted" },
  { from: ["IN_PRODUCTION"], to: "QUALITY_CHECK", by: ["BUSINESS"] },
  { from: ["QUALITY_CHECK"], to: "IN_PRODUCTION", by: ["BUSINESS"], when: "the garment needs more work" },
  { from: ["QUALITY_CHECK"], to: "READY", by: ["BUSINESS"] },
  { from: ["READY"], to: "DELIVERY_ASSIGNED", by: ["CUSTOMER", "BUSINESS", "SYSTEM"], when: "fulfilment is DELIVERY and the order is fully paid" },
  { from: ["READY"], to: "COLLECTED", by: ["BUSINESS"], when: "fulfilment is PICKUP, fully paid, and the customer's handover code matches" },
  { from: ["DELIVERY_ASSIGNED"], to: "PICKED_UP", by: ["RIDER"] },
  { from: ["DELIVERY_ASSIGNED", "PICKED_UP", "IN_TRANSIT"], to: "READY", by: ["RIDER", "ADMIN", "SYSTEM"], when: "delivery failed or was cancelled; the item goes back to the business" },
  { from: ["PICKED_UP"], to: "IN_TRANSIT", by: ["RIDER"] },
  { from: ["IN_TRANSIT", "PICKED_UP"], to: "DELIVERED", by: ["RIDER", "CUSTOMER"], when: "the customer's handover code matches" },
  { from: ["DELIVERED", "COLLECTED"], to: "COMPLETED", by: ["CUSTOMER", "SYSTEM", "ADMIN"], when: "settlement entries are written" },
  { from: ["DRAFT", "QUOTE_REQUESTED", "QUOTED", "AWAITING_PAYMENT"], to: "CANCELLED", by: ["CUSTOMER", "ADMIN", "SYSTEM"] },
  { from: ["AWAITING_PAYMENT"], to: "CANCELLED", by: ["BUSINESS"], when: "the business withdraws before payment" },
  { from: ["AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED"], to: "CANCELLED", by: ["CUSTOMER", "BUSINESS", "ADMIN"], when: "payments are refunded according to the cancellation policy" },
  {
    from: ["AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION", "QUALITY_CHECK", "READY", "DELIVERY_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COLLECTED", "COMPLETED"],
    to: "DISPUTED",
    by: ["CUSTOMER", "BUSINESS", "ADMIN"],
  },
  // Leaving a dispute: back to where it was, or closed out by the administrator.
  { from: ["DISPUTED"], to: "COMPLETED", by: ["ADMIN"] },
  { from: ["DISPUTED"], to: "CANCELLED", by: ["ADMIN"] },
  { from: ["DISPUTED"], to: "REFUNDED", by: ["ADMIN"] },
];

export const RESUMABLE_FROM_DISPUTE: OrderStatus[] = [
  "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION", "QUALITY_CHECK", "READY",
  "DELIVERY_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COLLECTED", "COMPLETED",
];

export function findTransition(from: string, to: string): Transition | undefined {
  return TRANSITIONS.find((t) => t.to === to && t.from.includes(from as OrderStatus));
}

/** True when `actor` (one of their relations) may move an order from `from` to `to`. */
export function canTransition(from: string, to: string, relations: (OrderRelation | "SYSTEM")[]): boolean {
  if (from === "DISPUTED" && relations.includes("ADMIN") && RESUMABLE_FROM_DISPUTE.includes(to as OrderStatus)) return true;
  const t = findTransition(from, to);
  return !!t && t.by.some((b) => relations.includes(b));
}

export function nextStatuses(from: string): OrderStatus[] {
  return TRANSITIONS.filter((t) => t.from.includes(from as OrderStatus)).map((t) => t.to);
}

/** Statuses after which the business has started work (cancellation means a refund decision). */
export const WORK_STARTED: OrderStatus[] = ["IN_PRODUCTION", "QUALITY_CHECK", "READY", "DELIVERY_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COLLECTED", "COMPLETED"];
export const OPEN_STATUSES: OrderStatus[] = [
  "QUOTE_REQUESTED", "QUOTED", "AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION",
  "QUALITY_CHECK", "READY", "DELIVERY_ASSIGNED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COLLECTED", "DISPUTED",
];
