import type { Prisma } from "@prisma/client";
import type { Actor } from "./actor";
import { orderRelations, type OrderRelation } from "./authz";
import { conflict, forbidden, notFound } from "./errors";
import { canTransition, findTransition } from "./order-machine";

type Tx = Prisma.TransactionClient;

/** Load an order with everything needed to decide who may see or change it. */
export async function loadOrderAccess(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      quotations: { select: { businessId: true, status: true } },
      appointments: { select: { professionalId: true, status: true } },
      deliveries: { select: { riderId: true, status: true } },
    },
  });
  if (!order) throw notFound("Order");
  return order;
}

export type OrderWithAccess = Awaited<ReturnType<typeof loadOrderAccess>>;

export function relationsFor(actor: Actor, order: OrderWithAccess): OrderRelation[] {
  return orderRelations(actor, {
    customerId: order.customerId,
    businessId: order.businessId,
    // Businesses asked for a quote may see the request while it is open.
    quotationBusinessIds: order.businessId ? [] : order.quotations.filter((q) => ["REQUESTED", "SUBMITTED"].includes(q.status)).map((q) => q.businessId),
    measurerIds: order.appointments.filter((a) => a.professionalId && a.status !== "CANCELLED").map((a) => a.professionalId!),
    riderIds: order.deliveries.filter((d) => d.riderId && d.status !== "CANCELLED").map((d) => d.riderId!),
  });
}

/** Throws NOT_FOUND (not FORBIDDEN, so ids can't be probed) unless the actor has one of `allowed` relations. */
export async function requireOrderAccess(tx: Tx, actor: Actor, orderId: string, allowed?: OrderRelation[]) {
  const order = await loadOrderAccess(tx, orderId);
  const rel = relationsFor(actor, order);
  if (rel.length === 0 || (allowed && !rel.some((r) => allowed.includes(r)))) throw notFound("Order");
  return { order, rel };
}

/**
 * Move an order between states. Checks the transition table and the actor's relation, then performs a
 * conditional update (WHERE status = from) so two people can't race the same order, and records an OrderEvent.
 */
export async function transition(
  tx: Tx,
  p: {
    orderId: string;
    from: string;
    to: string;
    actorId: string | null;
    as: OrderRelation | "SYSTEM";
    note?: string;
    data?: Record<string, unknown>;
    set?: Prisma.OrderUncheckedUpdateManyInput;
  },
) {
  if (!findTransition(p.from, p.to) && !(p.from === "DISPUTED" && p.as === "ADMIN")) {
    throw conflict(`An order can't move from "${p.from}" to "${p.to}".`);
  }
  if (!canTransition(p.from, p.to, [p.as])) throw forbidden("You can't make that change to this order.");
  const extra: Prisma.OrderUncheckedUpdateManyInput = { ...p.set };
  if (p.to === "DISPUTED") extra.previousStatus = p.from;
  if (p.to === "COMPLETED") extra.completedAt = new Date();
  const res = await tx.order.updateMany({ where: { id: p.orderId, status: p.from }, data: { status: p.to, ...extra } });
  if (res.count === 0) throw conflict("This order has just changed. Refresh the page and try again.");
  await tx.orderEvent.create({
    data: {
      orderId: p.orderId, type: "STATUS", fromStatus: p.from, toStatus: p.to, actorId: p.actorId, actorRole: p.as,
      note: p.note ?? "", data: (p.data ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function orderEvent(tx: Tx, orderId: string, type: string, actorId: string | null, as: string, note: string, data: Record<string, unknown> = {}) {
  await tx.orderEvent.create({ data: { orderId, type, actorId, actorRole: as, note, data: data as Prisma.InputJsonValue } });
}
