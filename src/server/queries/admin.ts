import "server-only";
import { db } from "@/lib/db";

// Read-only helpers for the administrator portal. Callers must check the admin permission first.

export const OPEN_DISPUTE_STATUSES = ["OPEN", "UNDER_REVIEW", "AWAITING_PARTY"];

/** Work waiting for an administrator, for the overview and the section tabs. */
export async function adminQueues() {
  const [verifications, disputes, tickets, refundsProcessing, refundsFailed, pendingStyles, reviewReports] = await Promise.all([
    db.verificationApplication.count({ where: { status: { in: ["PENDING", "NEEDS_INFO"] } } }),
    db.dispute.count({ where: { status: { in: OPEN_DISPUTE_STATUSES } } }),
    db.supportTicket.count({ where: { status: "OPEN" } }),
    db.refund.count({ where: { status: "PROCESSING" } }),
    db.refund.count({ where: { status: "FAILED" } }),
    db.style.count({ where: { status: "PENDING" } }),
    db.reviewReport.count({ where: { status: "OPEN" } }),
  ]);
  return { verifications, disputes, tickets, refundsProcessing, refundsFailed, pendingStyles, reviewReports };
}

/** Display names for ledger parties (businesses and individual partners). */
export async function partyNames(parties: { partyType: string; partyId: string }[]) {
  const businessIds = parties.filter((p) => p.partyType === "BUSINESS").map((p) => p.partyId);
  const userIds = parties.filter((p) => p.partyType === "USER").map((p) => p.partyId);
  const [businesses, users] = await Promise.all([
    businessIds.length ? db.business.findMany({ where: { id: { in: businessIds } }, select: { id: true, name: true, payoutPhone: true, phone: true, isDemo: true } }) : [],
    userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, phone: true, isDemo: true } }) : [],
  ]);
  const out = new Map<string, { name: string; phone: string; isDemo: boolean }>();
  for (const b of businesses) out.set(`BUSINESS:${b.id}`, { name: b.name, phone: b.payoutPhone ?? b.phone, isDemo: b.isDemo });
  for (const u of users) out.set(`USER:${u.id}`, { name: u.name, phone: u.phone, isDemo: u.isDemo });
  return out;
}

/** Names (and emails) for a set of user ids, e.g. audit actors or note authors. */
export async function userNames(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unique.length) return new Map<string, { name: string; email: string }>();
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, email: true } });
  return new Map(users.map((u) => [u.id, { name: u.name, email: u.email }]));
}

/** Page number from a search param (1-based, bounded). */
export function pageOf(value: string | undefined) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n < 100_000 ? n : 1;
}
