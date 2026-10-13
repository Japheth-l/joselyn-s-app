// Messaging, reviews, disputes and support.
import { z } from "zod";
import { db } from "@/lib/db";
import { DISPUTE_CATEGORIES, DISPUTE_REMEDIES, DISPUTE_STATUS } from "@/lib/enums";
import { formatMoney, parseCedis } from "@/lib/money";
import { addDays } from "@/lib/time";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { isAdmin, requireAdmin, requireMember } from "../authz";
import { conflict, invalid, notFound } from "../errors";
import { notify, notifyBusiness, notifyMany } from "../notifications";
import { orderEvent, requireOrderAccess, transition } from "../order-flow";
import { RESUMABLE_FROM_DISPUTE } from "../order-machine";
import { rateLimit } from "../rate-limit";
import { getSettings } from "../settings";

// ───────────── Messages ─────────────

/** Participants: the customer, members of the order's business, and assigned professional and riders. */
export async function conversationFor(actor: Actor, orderId: string) {
  await requireOrderAccess(db, actor, orderId, ["CUSTOMER", "BUSINESS", "MEASURER", "RIDER", "ADMIN"]);
  const conv = await db.conversation.upsert({ where: { orderId }, create: { orderId }, update: {} });
  const messages = await db.message.findMany({ where: { conversationId: conv.id }, include: { sender: { select: { name: true } } }, orderBy: { createdAt: "asc" }, take: 500 });
  await db.conversationRead.upsert({
    where: { conversationId_userId: { conversationId: conv.id, userId: actor.userId } },
    create: { conversationId: conv.id, userId: actor.userId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });
  const reads = await db.conversationRead.findMany({ where: { conversationId: conv.id } });
  return { conversation: conv, messages, reads };
}

export async function sendMessage(actor: Actor, orderId: string, body: string, fileIds: string[] = []) {
  const { order, rel } = await requireOrderAccess(db, actor, orderId, ["CUSTOMER", "BUSINESS", "MEASURER", "RIDER", "ADMIN"]);
  const text = z.string().trim().max(2000).parse(body);
  if (!text && fileIds.length === 0) throw invalid("Write a message or attach a photo.");
  await rateLimit(`msg:${actor.userId}`, 60, 600);
  const conv = await db.conversation.upsert({ where: { orderId }, create: { orderId }, update: {} });
  await db.message.create({ data: { conversationId: conv.id, senderId: actor.userId, body: text, fileIds } });
  // Tell the other participants.
  const appts = await db.appointment.findMany({ where: { orderId, professionalId: { not: null }, status: { not: "CANCELLED" } } });
  const legs = await db.deliveryAssignment.findMany({ where: { orderId, riderId: { not: null }, status: { not: "CANCELLED" } } });
  const people = [order.customerId, ...appts.map((a) => a.professionalId!), ...legs.map((l) => l.riderId!)].filter((id) => id !== actor.userId);
  const vars = { order: order.number, name: rel.includes("BUSINESS") && order.businessId ? actor.memberships.find((m) => m.businessId === order.businessId)?.businessName ?? actor.name : actor.name };
  await notifyMany(people, "message.new", vars, { link: `/orders/${orderId}/messages`, orderId });
  if (order.businessId && !rel.includes("BUSINESS")) await notifyBusiness(order.businessId, "message.new", vars, { link: `/biz/${order.businessId}/orders/${orderId}`, orderId });
}

// ───────────── Reviews ─────────────

async function refreshRating(businessId: string) {
  const agg = await db.review.aggregate({ where: { businessId, status: "PUBLISHED" }, _avg: { rating: true }, _count: true });
  await db.business.update({ where: { id: businessId }, data: { rating: Math.round((agg._avg.rating ?? 0) * 10) / 10, reviewCount: agg._count } });
}

/** Only for the customer's own completed order, once, within the review window. */
export async function submitReview(actor: Actor, orderId: string, rating: number, comment: string) {
  const r = z.number().int().min(1, "Choose a rating from 1 to 5 stars").max(5).parse(rating);
  const order = await db.order.findUnique({ where: { id: orderId }, include: { review: true } });
  if (!order || order.customerId !== actor.userId) throw notFound("Order");
  if (order.status !== "COMPLETED" || !order.businessId) throw invalid("You can review an order once it's completed.");
  if (order.review) throw conflict("You've already reviewed this order.");
  const settings = await getSettings();
  if (order.completedAt && addDays(order.completedAt, settings.reviewWindowDays) < new Date()) throw invalid("The review period for this order has ended.");
  await db.review.create({ data: { orderId, businessId: order.businessId, customerId: actor.userId, rating: r, comment: comment.trim().slice(0, 1500) } });
  await refreshRating(order.businessId);
  const b = await db.business.findUniqueOrThrow({ where: { id: order.businessId } });
  await notifyBusiness(order.businessId, "review.received", { business: b.name, rating: r }, { link: `/biz/${b.id}/reviews` });
}

export async function respondToReview(actor: Actor, reviewId: string, response: string) {
  const rv = await db.review.findUnique({ where: { id: reviewId } });
  if (!rv) throw notFound("Review");
  requireMember(actor, rv.businessId, "MANAGER");
  if (rv.businessResponse) throw conflict("You've already responded to this review.");
  await db.review.update({ where: { id: reviewId }, data: { businessResponse: z.string().trim().min(2).max(1000).parse(response), respondedAt: new Date() } });
}

export async function reportReview(actor: Actor, reviewId: string, reason: string) {
  if (!(await db.review.findUnique({ where: { id: reviewId } }))) throw notFound("Review");
  await rateLimit(`report:${actor.userId}`, 20, 3600);
  await db.reviewReport.create({ data: { reviewId, reporterId: actor.userId, reason: z.string().trim().min(3, "Say what's wrong with this review").max(500).parse(reason) } });
}

export async function moderateReview(actor: Actor, reviewId: string, status: "PUBLISHED" | "HIDDEN", note: string) {
  requireAdmin(actor, "DISPUTES");
  const rv = await db.review.update({ where: { id: reviewId }, data: { status } });
  await db.reviewReport.updateMany({ where: { reviewId, status: "OPEN" }, data: { status: status === "HIDDEN" ? "UPHELD" : "DISMISSED" } });
  await refreshRating(rv.businessId);
  await audit(actor.userId, "review.moderate", { type: "Review", id: reviewId }, { status, note });
}

// ───────────── Disputes ─────────────

export async function openDispute(actor: Actor, orderId: string, category: string, description: string, fileIds: string[] = []) {
  if (!(category in DISPUTE_CATEGORIES)) throw invalid("Choose what the problem is.");
  const text = z.string().trim().min(20, "Describe the problem in a few sentences").max(3000).parse(description);
  const { order, rel } = await requireOrderAccess(db, actor, orderId, ["CUSTOMER", "BUSINESS"]);
  if (!RESUMABLE_FROM_DISPUTE.includes(order.status as never)) throw invalid("A dispute can be raised once the order has been paid for.");
  if (order.status === "COMPLETED" && order.completedAt && addDays(order.completedAt, 30) < new Date()) throw invalid("Disputes must be raised within 30 days of completion.");
  const as = rel.includes("CUSTOMER") ? "CUSTOMER" : "BUSINESS";
  const dispute = await db.$transaction(async (tx) => {
    const d = await tx.dispute.create({ data: { orderId, raisedById: actor.userId, category, description: text } });
    if (fileIds.length) await tx.disputeNote.create({ data: { disputeId: d.id, authorId: actor.userId, body: "Evidence", fileIds } });
    await transition(tx, { orderId, from: order.status, to: "DISPUTED", actorId: actor.userId, as, note: `Dispute #${d.number}: ${DISPUTE_CATEGORIES[category as keyof typeof DISPUTE_CATEGORIES]}` });
    return d;
  });
  await notify(order.customerId, "dispute.opened", { order: order.number }, { link: `/support/disputes/${dispute.id}`, orderId });
  if (order.businessId) await notifyBusiness(order.businessId, "dispute.opened", { order: order.number }, { orderId });
  const admins = await db.roleAssignment.findMany({ where: { role: "ADMIN" } });
  await notifyMany(admins.filter((a) => a.permissions.includes("SUPER") || a.permissions.includes("DISPUTES")).map((a) => a.userId), "dispute.opened", { order: order.number }, { link: `/admin/disputes/${dispute.id}` });
  return dispute;
}

/** Parties (customer, business members) and dispute admins may read a dispute; internal notes are admin-only. */
export async function getDispute(actor: Actor, disputeId: string) {
  const d = await db.dispute.findUnique({
    where: { id: disputeId },
    include: { order: { include: { business: true, customer: { select: { name: true } }, events: { orderBy: { createdAt: "asc" } }, payments: true, refunds: true } }, notes: { orderBy: { createdAt: "asc" } }, raisedBy: { select: { name: true } }, assignedAdmin: { select: { name: true } } },
  });
  if (!d) throw notFound("Dispute");
  const admin = isAdmin(actor, "DISPUTES");
  const party = d.order.customerId === actor.userId || (d.order.businessId && actor.memberships.some((m) => m.businessId === d.order.businessId));
  if (!admin && !party) throw notFound("Dispute");
  return { ...d, notes: admin ? d.notes : d.notes.filter((n) => !n.internal), isAdmin: admin };
}

export async function addDisputeNote(actor: Actor, disputeId: string, body: string, fileIds: string[], internal: boolean) {
  const d = await getDispute(actor, disputeId);
  if (["RESOLVED", "REJECTED"].includes(d.status)) throw invalid("This dispute is closed.");
  const text = z.string().trim().min(1).max(3000).parse(body);
  await db.disputeNote.create({ data: { disputeId, authorId: actor.userId, body: text, fileIds, internal: internal && d.isAdmin } });
  if (d.isAdmin && !internal) {
    await notify(d.order.customerId, "dispute.updated", { dispute: d.number, status: "new message from our team" }, { link: `/support/disputes/${disputeId}` });
    if (d.order.businessId) await notifyBusiness(d.order.businessId, "dispute.updated", { dispute: d.number, status: "new message from our team" }, {});
  }
}

export async function assignDispute(actor: Actor, disputeId: string, status: "UNDER_REVIEW" | "AWAITING_PARTY") {
  requireAdmin(actor, "DISPUTES");
  await db.dispute.update({ where: { id: disputeId }, data: { assignedAdminId: actor.userId, status } });
  await audit(actor.userId, "dispute.assign", { type: "Dispute", id: disputeId }, { status });
}

const resolveSchema = z.object({
  remedy: z.enum(Object.keys(DISPUTE_REMEDIES) as [string, ...string[]]),
  refundAmount: z.string().optional(),
  resolution: z.string().trim().min(10, "Explain the decision").max(3000),
  orderOutcome: z.enum(["RESUME", "COMPLETED", "CANCELLED", "REFUNDED"]),
  reject: z.boolean().default(false),
});

/** Close a dispute with a remedy. Refunds go through the normal refund process and ledger. */
export async function resolveDispute(actor: Actor, disputeId: string, input: z.input<typeof resolveSchema>) {
  requireAdmin(actor, "DISPUTES");
  const p = resolveSchema.parse(input);
  const d = await db.dispute.findUnique({ where: { id: disputeId }, include: { order: true } });
  if (!d) throw notFound("Dispute");
  if (["RESOLVED", "REJECTED"].includes(d.status)) throw invalid("This dispute is already closed.");
  const refund = p.refundAmount ? parseCedis(p.refundAmount) : null;
  if (["PARTIAL_REFUND", "FULL_REFUND"].includes(p.remedy) && !refund) throw invalid("Enter the refund amount.");
  if (refund && !isAdmin(actor, "FINANCE")) throw invalid("Refunds need the Finance permission as well.");
  if (refund) {
    const { issueRefund } = await import("./payments");
    await issueRefund({ orderId: d.orderId, amountMinor: refund, reason: `Dispute #${d.number}: ${p.resolution}`, requestedById: d.raisedById, decidedById: actor.userId, disputeId });
  }
  const order = await db.order.findUniqueOrThrow({ where: { id: d.orderId } });
  const to = p.orderOutcome === "RESUME" ? order.previousStatus ?? "COMPLETED" : p.orderOutcome;
  await db.$transaction(async (tx) => {
    await tx.dispute.update({ where: { id: disputeId }, data: { status: p.reject ? "REJECTED" : "RESOLVED", remedy: p.remedy, resolution: p.resolution, resolvedAt: new Date(), assignedAdminId: actor.userId } });
    if (order.status === "DISPUTED") {
      await transition(tx, { orderId: d.orderId, from: "DISPUTED", to, actorId: actor.userId, as: "ADMIN", note: `Dispute #${d.number} ${p.reject ? "closed" : "resolved"}` });
      if (to === "COMPLETED" && order.previousStatus !== "COMPLETED") {
        const { settleCompletedOrder } = await import("./payments");
        await settleCompletedOrder(tx, d.orderId);
      }
    }
    await audit(actor.userId, "dispute.resolve", { type: "Dispute", id: disputeId }, { remedy: p.remedy, refundMinor: refund, outcome: to }, tx);
  });
  const status = `${DISPUTE_STATUS[p.reject ? "REJECTED" : "RESOLVED"]}${refund ? `, refund of ${formatMoney(refund)}` : ""}`;
  await notify(order.customerId, "dispute.updated", { dispute: d.number, status }, { link: `/support/disputes/${disputeId}` });
  if (order.businessId) await notifyBusiness(order.businessId, "dispute.updated", { dispute: d.number, status }, {});
}

// ───────────── Support ─────────────

export async function openTicket(actor: Actor, subject: string, body: string, orderId?: string) {
  await rateLimit(`ticket:${actor.userId}`, 10, 3600);
  if (orderId) await requireOrderAccess(db, actor, orderId);
  return db.supportTicket.create({
    data: {
      userId: actor.userId, orderId: orderId || null, subject: z.string().trim().min(3, "Add a short subject").max(120).parse(subject),
      messages: { create: { authorId: actor.userId, body: z.string().trim().min(5, "Describe how we can help").max(3000).parse(body) } },
    },
  });
}

export async function replyTicket(actor: Actor, ticketId: string, body: string) {
  const t = await db.supportTicket.findUnique({ where: { id: ticketId } });
  const staff = isAdmin(actor, "DISPUTES");
  if (!t || (t.userId !== actor.userId && !staff)) throw notFound("Support request");
  if (t.status === "CLOSED") throw invalid("This request is closed. Open a new one.");
  await db.supportMessage.create({ data: { ticketId, authorId: actor.userId, body: z.string().trim().min(1).max(3000).parse(body), fromStaff: staff && t.userId !== actor.userId } });
  await db.supportTicket.update({ where: { id: ticketId }, data: { status: staff && t.userId !== actor.userId ? "ANSWERED" : "OPEN" } });
  if (staff && t.userId !== actor.userId) await notify(t.userId, "support.reply", { subject: t.subject }, { link: `/support/${ticketId}` });
}

export async function closeTicket(actor: Actor, ticketId: string) {
  const t = await db.supportTicket.findUnique({ where: { id: ticketId } });
  if (!t || (t.userId !== actor.userId && !isAdmin(actor, "DISPUTES"))) throw notFound("Support request");
  await db.supportTicket.update({ where: { id: ticketId }, data: { status: "CLOSED" } });
}

export { orderEvent };
