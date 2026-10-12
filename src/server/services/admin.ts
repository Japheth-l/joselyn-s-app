import { z } from "zod";
import { db } from "@/lib/db";
import { VERIFICATION_LABELS } from "@/lib/enums";
import { formatMoney, parseCedis } from "@/lib/money";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { requireAdmin } from "../authz";
import { invalid, notFound } from "../errors";
import { notify, notifyBusiness } from "../notifications";
import { TEMPLATES, type TemplateKey } from "../notifications/templates";
import { issueRefund } from "./payments";

// ───────────── Verification ─────────────

const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED", "NEEDS_INFO"]),
  note: z.string().trim().max(1000).default(""),
});

/** Decide a verification application and apply it to the business or professional profile. */
export async function decideVerification(actor: Actor, applicationId: string, input: z.input<typeof decisionSchema>) {
  requireAdmin(actor, "VERIFY");
  const d = decisionSchema.parse(input);
  if (d.decision !== "APPROVED" && !d.note) throw invalid("Tell the applicant why, so they know what to fix.");
  const app = await db.verificationApplication.findUnique({ where: { id: applicationId }, include: { business: true } });
  if (!app) throw notFound("Application");
  if (app.status === "APPROVED" || app.status === "REJECTED") throw invalid("This application has already been decided.");
  if (app.applicantId === actor.userId) throw invalid("You can't decide your own application.");

  const subjectStatus = d.decision === "APPROVED" ? "VERIFIED" : d.decision === "REJECTED" ? "REJECTED" : "PENDING";
  await db.$transaction(async (tx) => {
    const updated = await tx.verificationApplication.updateMany({
      where: { id: app.id, status: app.status },
      data: { status: d.decision, reviewerId: actor.userId, decisionNote: d.note, decidedAt: new Date() },
    });
    if (updated.count !== 1) throw invalid("Someone else decided this application first. Refresh to see it.");
    if (app.subjectType === "BUSINESS") {
      if (!app.businessId) throw invalid("This application isn't linked to a business.");
      await tx.business.update({ where: { id: app.businessId }, data: { verificationStatus: subjectStatus } });
    } else {
      await tx.agentProfile.update({ where: { userId_kind: { userId: app.applicantId, kind: app.subjectType } }, data: { verificationStatus: subjectStatus } });
      if (d.decision === "APPROVED") {
        await tx.roleAssignment.upsert({
          where: { userId_role: { userId: app.applicantId, role: app.subjectType } },
          create: { userId: app.applicantId, role: app.subjectType },
          update: {},
        });
      }
    }
    await audit(actor.userId, `verification.${d.decision.toLowerCase()}`, { type: "VerificationApplication", id: app.id }, { subjectType: app.subjectType, businessId: app.businessId }, tx);
  });

  const subject = app.subjectType === "BUSINESS" ? app.business?.name ?? "business" : app.subjectType === "MEASURER" ? "measurement professional" : "delivery rider";
  const vars = { subject, status: VERIFICATION_LABELS[d.decision === "APPROVED" ? "VERIFIED" : d.decision] ?? d.decision, note: d.note };
  if (app.businessId) await notifyBusiness(app.businessId, "verification.decided", vars, { link: `/biz/${app.businessId}/verification` });
  else await notify(app.applicantId, "verification.decided", vars, { link: "/pro" });
}

/** Suspend or reinstate a verified business or professional (e.g. after a serious complaint). */
export async function setSubjectStatus(
  actor: Actor,
  subject: { type: "BUSINESS"; id: string } | { type: "MEASURER" | "RIDER"; userId: string },
  status: "VERIFIED" | "SUSPENDED",
  reason: string,
) {
  requireAdmin(actor, "VERIFY");
  if (!reason.trim()) throw invalid("Give a reason; it is kept in the audit log.");
  if (subject.type === "BUSINESS") {
    const b = await db.business.findUnique({ where: { id: subject.id } });
    if (!b) throw notFound("Business");
    if (status === "VERIFIED" && b.verificationStatus !== "SUSPENDED") throw invalid("Only a suspended business can be reinstated.");
    await db.business.update({ where: { id: b.id }, data: { verificationStatus: status } });
    await audit(actor.userId, `business.${status.toLowerCase()}`, { type: "Business", id: b.id }, { reason });
  } else {
    const p = await db.agentProfile.findUnique({ where: { userId_kind: { userId: subject.userId, kind: subject.type } } });
    if (!p) throw notFound("Profile");
    if (status === "VERIFIED" && p.verificationStatus !== "SUSPENDED") throw invalid("Only a suspended professional can be reinstated.");
    await db.agentProfile.update({ where: { id: p.id }, data: { verificationStatus: status } });
    await audit(actor.userId, `agent.${status.toLowerCase()}`, { type: "AgentProfile", id: p.id }, { reason });
  }
}

// ───────────── Message templates ─────────────

const placeholders = (s: string) => new Set([...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]));

/** Override the wording of a notification. Only placeholders the default uses are allowed. */
export async function setTemplate(actor: Actor, key: string, body: string) {
  requireAdmin(actor, "CONFIG");
  if (!(key in TEMPLATES)) throw notFound("Template");
  const text = body.trim();
  if (!text) throw invalid("The message can't be empty.");
  if (text.length > 480) throw invalid("Keep messages under 480 characters so they fit in a few SMS segments.");
  const allowed = placeholders(TEMPLATES[key as TemplateKey]);
  const unknown = [...placeholders(text)].filter((p) => !allowed.has(p));
  if (unknown.length) throw invalid(`Unknown placeholder(s): ${unknown.map((u) => `{{${u}}}`).join(", ")}. Allowed: ${[...allowed].map((a) => `{{${a}}}`).join(", ") || "none"}.`);
  await db.notificationTemplate.upsert({ where: { key }, create: { key, body: text }, update: { body: text } });
  await audit(actor.userId, "template.updated", { type: "NotificationTemplate", id: key }, { body: text });
}

export async function resetTemplate(actor: Actor, key: string) {
  requireAdmin(actor, "CONFIG");
  await db.notificationTemplate.deleteMany({ where: { key } });
  await audit(actor.userId, "template.reset", { type: "NotificationTemplate", id: key }, {});
}

// ───────────── Reports ─────────────

/**
 * Operational report for a date range, computed only from recorded data. Demo records are excluded
 * unless `includeDemo` is set, so seeded data can never be mistaken for real activity.
 */
export async function report(actor: Actor, from: Date, to: Date, includeDemo = false) {
  requireAdmin(actor, "AUDIT");
  const demo = includeDemo ? {} : { isDemo: false };
  const range = { gte: from, lt: to };

  const [ordersByStatus, newOrders, completed, payments, refunds, platform, disputes, newUsers, newBusinesses, deliveries, appointments] = await Promise.all([
    db.order.groupBy({ by: ["status"], where: { ...demo, createdAt: range }, _count: true }),
    db.order.count({ where: { ...demo, createdAt: range } }),
    db.order.findMany({ where: { ...demo, completedAt: range }, select: { createdAt: true, completedAt: true } }),
    db.payment.aggregate({ where: { status: "SUCCEEDED", verifiedAt: range, order: demo }, _sum: { amountMinor: true }, _count: true }),
    db.refund.aggregate({ where: { status: "SUCCEEDED", createdAt: range, order: demo }, _sum: { amountMinor: true }, _count: true }),
    db.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM(l."amountMinor") AS total FROM "LedgerEntry" l LEFT JOIN "Order" o ON o.id = l."orderId"
      WHERE l.account = 'PLATFORM_REVENUE' AND l."createdAt" >= ${from} AND l."createdAt" < ${to}
        AND (${includeDemo} OR o.id IS NULL OR o."isDemo" = false)`,
    db.dispute.groupBy({ by: ["status"], where: { createdAt: range, order: demo }, _count: true }),
    db.user.count({ where: { ...demo, createdAt: range } }),
    db.business.count({ where: { ...demo, createdAt: range } }),
    db.deliveryAssignment.groupBy({ by: ["status"], where: { createdAt: range, order: demo }, _count: true }),
    db.appointment.groupBy({ by: ["status"], where: { createdAt: range, ...(includeDemo ? {} : { order: { isDemo: false } }) }, _count: true }),
  ]);

  const turnaround = completed.filter((o) => o.completedAt).map((o) => (o.completedAt!.getTime() - o.createdAt.getTime()) / 86_400_000);
  const median = turnaround.length ? turnaround.sort((a, b) => a - b)[Math.floor(turnaround.length / 2)] : null;
  const count = (rows: { _count: number }[]) => rows.reduce((t, r) => t + r._count, 0);
  const by = (rows: { status: string; _count: number }[]) => Object.fromEntries(rows.map((r) => [r.status, r._count]));

  return {
    from, to, includeDemo,
    orders: { created: newOrders, completed: completed.length, byStatus: by(ordersByStatus), medianDaysToComplete: median },
    money: {
      collectedMinor: payments._sum.amountMinor ?? 0, paymentCount: payments._count,
      refundedMinor: refunds._sum.amountMinor ?? 0, refundCount: refunds._count,
      platformRevenueMinor: Number(platform[0]?.total ?? 0),
    },
    disputes: { opened: count(disputes), byStatus: by(disputes) },
    deliveries: by(deliveries),
    appointments: by(appointments),
    growth: { newUsers, newBusinesses },
  };
}

/**
 * Ledger health check: money in must equal the sum of all ledger entries, and no account may hold
 * a balance that the rules forbid. Returns problems found (empty when healthy).
 */
export async function reconcile(actor: Actor) {
  requireAdmin(actor, "FINANCE");
  const problems: string[] = [];
  const [paid, ledger, legacy] = await Promise.all([
    db.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amountMinor: true } }),
    db.ledgerEntry.aggregate({ _sum: { amountMinor: true } }),
    db.ledgerEntry.aggregate({ where: { type: "PAYMENT_RECEIVED" }, _sum: { amountMinor: true } }),
  ]);
  const paidIn = paid._sum.amountMinor ?? 0;
  if ((ledger._sum.amountMinor ?? 0) !== paidIn) problems.push(`Ledger total ${ledger._sum.amountMinor ?? 0} differs from successful payments ${paidIn}.`);
  if ((legacy._sum.amountMinor ?? 0) !== paidIn) problems.push(`Recorded receipts ${legacy._sum.amountMinor ?? 0} differ from successful payments ${paidIn}.`);

  const negativeHeld = await db.$queryRaw<{ orderId: string; held: bigint }[]>`
    SELECT "orderId", SUM("amountMinor") AS held FROM "LedgerEntry"
    WHERE account = 'CUSTOMER_FUNDS' AND "orderId" IS NOT NULL GROUP BY "orderId" HAVING SUM("amountMinor") < 0`;
  for (const r of negativeHeld) problems.push(`Order ${r.orderId} holds a negative customer balance (${r.held}).`);

  const mismatched = await db.$queryRaw<{ id: string; number: number }[]>`
    SELECT o.id, o.number FROM "Order" o
    LEFT JOIN (SELECT "orderId", SUM("amountMinor") AS paid FROM "Payment" WHERE status = 'SUCCEEDED' GROUP BY "orderId") p ON p."orderId" = o.id
    WHERE o."amountPaidMinor" <> COALESCE(p.paid, 0)`;
  for (const r of mismatched) problems.push(`Order #${r.number} shows a paid amount that differs from its successful payments.`);

  await audit(actor.userId, "ledger.reconciled", { type: "Ledger", id: "all" }, { problems: problems.length });
  return { paidInMinor: paidIn, problems };
}

// ───────────── Refunds ─────────────

/** A finance administrator refunds part or all of what an order has paid (outside a dispute). */
export async function adminRefund(actor: Actor, orderId: string, amountCedis: string, reason: string) {
  requireAdmin(actor, "FINANCE");
  const why = reason.trim();
  if (!why) throw invalid("Give a reason for the refund; it is kept in the audit log and shown on the order.");
  const amountMinor = parseCedis(amountCedis);
  if (!amountMinor || amountMinor <= 0) throw invalid("Enter the refund amount in cedis, e.g. 50 or 50.25.");
  const order = await db.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!order) throw notFound("Order");
  const refunds = await issueRefund({ orderId, amountMinor, reason: why.slice(0, 500), requestedById: actor.userId, decidedById: actor.userId });
  await audit(actor.userId, "refund.admin_issue", { type: "Order", id: orderId }, { amountMinor, reason: why.slice(0, 500), refundIds: refunds.map((r) => r.id) });
  // Re-read: processing may have completed, failed, or left a part for a manual Mobile Money refund.
  const after = await db.refund.findMany({ where: { id: { in: refunds.map((r) => r.id) } }, select: { id: true, status: true, amountMinor: true } });
  return { amount: formatMoney(amountMinor), refunds: after };
}
