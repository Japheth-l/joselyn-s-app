import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import type { MembershipRole } from "@/lib/enums";
import { requireActor } from "../auth";
import { membershipRole } from "../authz";
import { OPEN_STATUSES } from "../order-machine";

// Read-only helpers for the business portal (/biz/[id]). Every caller goes through `businessPage`,
// which turns "not a member" into a 404 so the existence of a business can't be probed.

const RANK: Record<MembershipRole, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };

export const atLeast = (role: MembershipRole, min: MembershipRole) => RANK[role] >= RANK[min];

const loadBusiness = cache((id: string) => db.business.findUnique({ where: { id } }));

/** Signed-in member of this business, or 404. */
export async function businessPage(id: string) {
  const actor = await requireActor();
  const role = membershipRole(actor, id);
  if (!role) notFound();
  const business = await loadBusiness(id);
  if (!business) notFound();
  return { actor, role, business };
}

/** Low stock: less than 3 yards (or the same length in metres) available to sell. */
export function lowStockThreshold(unit: string) {
  return unit === "METRE" ? 275 : 300;
}
export const availableCenti = (l: { qtyOnHandCenti: number; qtyReservedCenti: number }) => l.qtyOnHandCenti - l.qtyReservedCenti;

/** Quote requests this business has not answered yet, on orders still collecting quotes. */
export const openQuoteRequestsWhere = (businessId: string) => ({
  businessId,
  status: "REQUESTED",
  order: { status: { in: ["QUOTE_REQUESTED", "QUOTED"] } },
});

/** Fabric orders waiting for this seller to confirm stock. */
export const fabricToConfirmWhere = (businessId: string) => ({ businessId, kind: "FABRIC", status: "QUOTE_REQUESTED" });

/** Counts for the section tabs. */
export const businessCounts = cache(async (businessId: string) => {
  const [quoteRequests, fabricToConfirm] = await Promise.all([
    db.quotation.count({ where: openQuoteRequestsWhere(businessId) }),
    db.order.count({ where: fabricToConfirmWhere(businessId) }),
  ]);
  return { awaitingReply: quoteRequests + fabricToConfirm };
});

export const ACTIVE_STATUSES = OPEN_STATUSES.filter((s) => s !== "QUOTE_REQUESTED" && s !== "QUOTED");
export const CLOSED_STATUSES = ["COMPLETED", "CANCELLED", "REFUNDED"];

/** "Sleeve: Short" pairs for an order's design choices, using the style's option labels. */
export function designLines(choices: unknown, options: { key: string; label: string }[] = []): [string, string][] {
  if (!choices || typeof choices !== "object") return [];
  return Object.entries(choices as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && v)
    .map(([k, v]) => [k === "colour" ? "Colour" : options.find((o) => o.key === k)?.label ?? k, String(v)]);
}

/** Latest verification application, for the "more information needed" note. */
export async function latestVerification(businessId: string) {
  return db.verificationApplication.findFirst({ where: { businessId }, orderBy: { createdAt: "desc" } });
}

/**
 * An order as this business may see it: it must hold a quotation for it or be the order's business.
 * Customer contact and measurements are only loaded once the order is assigned to this business.
 * Never selects the customer's address or budget.
 */
export async function orderForBusiness(businessId: string, orderId: string) {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true, number: true, kind: true, status: true, paymentStatus: true, customerId: true, businessId: true, designChoices: true,
      instructions: true, referenceFileIds: true, fabricSource: true, fabricQtyCenti: true, neededBy: true, measurementMethod: true,
      measurementRecordId: true, fulfilment: true, totalMinor: true, depositMinor: true, amountPaidMinor: true, amountRefundedMinor: true,
      cancelReason: true, isDemo: true, createdAt: true, parentOrderId: true, acceptedQuotationId: true,
      style: { include: { category: true, options: { orderBy: { sortOrder: "asc" } } } },
      fabricListing: { select: { id: true, name: true, unit: true, fabricType: true, color: true, photos: true, businessId: true } },
      fabricOrders: { select: { id: true, number: true, status: true } },
      quotations: { where: { businessId }, include: { lines: { orderBy: { sortOrder: "asc" } } }, orderBy: { version: "asc" } },
    },
  });
  if (!order) return null;
  const assigned = order.businessId === businessId;
  if (!assigned && order.quotations.length === 0) return null;

  const [events, customer, measurement, appointments, deliveries] = assigned
    ? await Promise.all([
        db.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } }),
        db.user.findUnique({ where: { id: order.customerId }, select: { name: true, phone: true } }),
        order.measurementRecordId ? db.measurementRecord.findUnique({ where: { id: order.measurementRecordId } }) : null,
        db.appointment.findMany({
          where: { orderId },
          select: { id: true, kind: true, status: true, windowStart: true, windowEnd: true, professional: { select: { name: true } } },
          orderBy: { windowStart: "asc" },
        }),
        db.deliveryAssignment.findMany({ where: { orderId }, select: { id: true, leg: true, status: true, attempt: true }, orderBy: { createdAt: "asc" } }),
      ])
    : [[], null, null, [], []];
  return { order, assigned, events, customer, measurement, appointments, deliveries };
}
