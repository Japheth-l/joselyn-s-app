"use server";

import { redirect } from "next/navigation";
import { parseCedis } from "@/lib/money";
import { run, type ActionResult } from "@/server/action";
import { invalid } from "@/server/errors";
import { publicUrl, saveUpload, saveUploads } from "@/server/files";
import { bool, list, optNum, optStr, str } from "@/server/forms";
import { updateSetting } from "@/server/settings";
import * as accounts from "@/server/services/accounts";
import * as admin from "@/server/services/admin";
import * as catalogue from "@/server/services/catalogue";
import * as community from "@/server/services/community";
import * as deliveries from "@/server/services/deliveries";
import * as orders from "@/server/services/orders";
import * as payments from "@/server/services/payments";

// Administrator actions. Every service re-checks the admin permission; hidden inputs only carry ids.

// ── Verification ──

export async function decideVerificationAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const decision = str(fd, "decision") as "APPROVED" | "REJECTED" | "NEEDS_INFO";
    await admin.decideVerification(a, str(fd, "applicationId"), { decision, note: str(fd, "note") });
    return decision === "APPROVED" ? "Approved. The applicant has been told." : decision === "REJECTED" ? "Rejected. The applicant has been told why." : "Asked the applicant for more information.";
  });
}

export async function setSubjectStatusAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const type = str(fd, "subjectType");
    const status = str(fd, "status") === "VERIFIED" ? "VERIFIED" : "SUSPENDED";
    if (type === "BUSINESS") await admin.setSubjectStatus(a, { type: "BUSINESS", id: str(fd, "subjectId") }, status, str(fd, "reason"));
    else if (type === "MEASURER" || type === "RIDER") await admin.setSubjectStatus(a, { type, userId: str(fd, "subjectId") }, status, str(fd, "reason"));
    else throw invalid("Unknown profile type.");
    return status === "SUSPENDED" ? "Suspended." : "Reinstated.";
  });
}

// ── Users ──

export async function setUserStatusAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const status = str(fd, "status") === "ACTIVE" ? "ACTIVE" : "SUSPENDED";
    await accounts.setUserStatus(a, str(fd, "userId"), status, str(fd, "reason"));
    return status === "SUSPENDED" ? "Account suspended and signed out everywhere." : "Account reinstated.";
  });
}

export async function setAdminPermissionsAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const perms = list(fd, "permissions");
    await accounts.setAdminPermissions(a, str(fd, "userId"), perms);
    return perms.length ? "Administrator permissions saved. The person must sign in again." : "Administrator access removed.";
  });
}

// ── Orders ──

export async function adminCancelOrderAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const reason = str(fd, "reason");
    if (!reason) throw invalid("Give a reason; the customer and business will see it.");
    await orders.cancelOrder(a, str(fd, "orderId"), reason);
    return "Order cancelled. Any refund due under the cancellation policy has been started.";
  });
}

export async function adminRefundAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const r = await admin.adminRefund(a, str(fd, "orderId"), str(fd, "amount"), str(fd, "reason"));
    if (r.refunds.some((x) => x.status === "FAILED")) return `The refund of ${r.amount} was recorded but the payment provider did not accept it. It is listed under Finance → failed refunds.`;
    if (r.refunds.some((x) => x.status === "PROCESSING")) return `Refund of ${r.amount} recorded. Part of it was a legacy payment: send it by Mobile Money and confirm it under Finance.`;
    return r.refunds.every((x) => x.status === "SUCCEEDED") ? `Refund of ${r.amount} processed.` : `Refund of ${r.amount} sent to the payment provider; it completes when they confirm.`;
  });
}

export async function reopenDeliveryAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await deliveries.reopenDelivery(a, str(fd, "orderId"));
    return "Delivery reopened; riders will be offered it again.";
  });
}

// ── Disputes ──

export async function addDisputeNoteAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const disputeId = str(fd, "disputeId");
    // Read the dispute first (permission check) so attachments are linked to the right order.
    const d = await community.getDispute(a, disputeId);
    const files = await saveUploads(a, fd.getAll("evidence"), { purpose: "DISPUTE", orderId: d.orderId, allowPdf: true }, 5);
    const internal = bool(fd, "internal");
    await community.addDisputeNote(a, disputeId, str(fd, "body"), files.map((f) => f.id), internal);
    return internal ? "Internal note added (administrators only)." : "Message sent to both parties.";
  });
}

export async function assignDisputeAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const status = str(fd, "status") === "AWAITING_PARTY" ? "AWAITING_PARTY" : "UNDER_REVIEW";
    await community.assignDispute(a, str(fd, "disputeId"), status);
    return status === "AWAITING_PARTY" ? "Marked as waiting for a reply. You are assigned." : "Marked under review. You are assigned.";
  });
}

export async function resolveDisputeAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const reject = bool(fd, "reject");
    await community.resolveDispute(a, str(fd, "disputeId"), {
      remedy: str(fd, "remedy"),
      refundAmount: optStr(fd, "refundAmount"),
      resolution: str(fd, "resolution"),
      orderOutcome: str(fd, "orderOutcome") as "RESUME" | "COMPLETED" | "CANCELLED" | "REFUNDED",
      reject,
    });
    return reject ? "Dispute closed without action." : "Dispute resolved. Both parties have been told.";
  });
}

// ── Reviews & support ──

export async function moderateReviewAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const status = str(fd, "status") === "HIDDEN" ? "HIDDEN" : "PUBLISHED";
    await community.moderateReview(a, str(fd, "reviewId"), status, str(fd, "note"));
    return status === "HIDDEN" ? "Review hidden; reports upheld." : "Review published; reports dismissed.";
  });
}

export async function adminReplyTicketAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await community.replyTicket(a, str(fd, "ticketId"), str(fd, "body"));
    return "Reply sent.";
  });
}

export async function adminCloseTicketAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await community.closeTicket(a, str(fd, "ticketId"));
    return "Request closed.";
  });
}

// ── Finance ──

export async function recordPayoutAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const partyType = str(fd, "partyType") === "BUSINESS" ? "BUSINESS" : "USER";
    const destination = str(fd, "destination");
    if (!destination) throw invalid("Enter the Mobile Money number the money was sent to.");
    const p = await payments.recordPayoutForParty(a, { partyType, partyId: str(fd, "partyId"), amount: str(fd, "amount"), reference: str(fd, "reference"), destination });
    return `Payout recorded (ref ${p.reference}). The partner has been notified.`;
  });
}

export async function confirmManualRefundAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await payments.confirmManualRefund(a, str(fd, "refundId"), str(fd, "reference"));
    return "Refund marked as sent. The customer has been told.";
  });
}

export async function reconcileAction(_: ActionResult, _fd: FormData): Promise<ActionResult> {
  let problems: string[] = [];
  const res = await run(async (a) => {
    const r = await admin.reconcile(a);
    problems = r.problems;
    return problems.length ? undefined : "Ledger balanced: every recorded payment is accounted for.";
  });
  if (res?.error || problems.length === 0) return res;
  return { error: `${problems.length} problem${problems.length === 1 ? "" : "s"} found: ${problems.join(" • ")}` };
}

// ── Catalogue ──

export async function upsertCategoryAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const name = str(fd, "name");
    if (name.length < 2) throw invalid("Enter the category name.");
    await catalogue.upsertCategory(a, { slug: str(fd, "slug"), name, description: str(fd, "description"), sortOrder: Math.trunc(optNum(fd, "sortOrder") ?? 0), isActive: bool(fd, "isActive") });
    return "Category saved.";
  });
}

export async function reviewStyleAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const d = str(fd, "decision");
    const decision = d === "PUBLISHED" || d === "REJECTED" || d === "ARCHIVED" ? d : null;
    if (!decision) throw invalid("Choose a decision.");
    await catalogue.reviewStyle(a, str(fd, "styleId"), decision, str(fd, "note"));
    return decision === "PUBLISHED" ? "Style published." : decision === "REJECTED" ? "Style rejected." : "Style archived.";
  });
}

export async function createStyleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let styleId = "";
  const res = await run(async (a) => {
    const style = await catalogue.createStyle(a, {
      name: str(fd, "name"),
      categoryId: str(fd, "categoryId"),
      wearer: str(fd, "wearer"),
      occasions: list(fd, "occasions"),
      description: str(fd, "description"),
      complexity: str(fd, "complexity"),
      indicativeLabour: optStr(fd, "indicativeLabour"),
      fabricYards: str(fd, "fabricYards"),
      measurementKeys: list(fd, "measurementKeys"),
      icon: optStr(fd, "icon"),
    });
    styleId = style.id;
  });
  if (styleId) redirect(`/admin/catalogue/styles/${styleId}?created=1`);
  return res;
}

export async function upsertStyleOptionAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const choices = str(fd, "choices").split(",").map((c) => c.trim()).filter(Boolean);
    await catalogue.upsertStyleOption(a, str(fd, "styleId"), { key: str(fd, "key"), label: str(fd, "label"), choices, sortOrder: Math.trunc(optNum(fd, "sortOrder") ?? 0) });
    return "Option saved.";
  });
}

export async function removeStyleOptionAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await catalogue.removeStyleOption(a, str(fd, "optionId"));
    return "Option removed.";
  });
}

export async function setStyleImageAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const file = await saveUpload(a, fd.get("photo"), { purpose: "STYLE" });
    if (!file) throw invalid("Choose a photo to upload.");
    await catalogue.setStyleImage(a, str(fd, "styleId"), publicUrl(file));
    return "Photo updated.";
  });
}

// ── Settings & templates ──

export async function updateSettingAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    const key = str(fd, "key");
    const raw = str(fd, "value");
    let value: number;
    if (key.endsWith("Minor")) {
      // Money settings are typed in cedis and stored in pesewas.
      const minor = parseCedis(raw);
      if (minor == null) throw invalid("Enter an amount in cedis, e.g. 15 or 15.50.");
      value = minor;
    } else {
      value = Number(raw);
      if (raw === "" || !Number.isFinite(value)) throw invalid("Enter a whole number.");
    }
    await updateSetting(a, key, value);
    return "Setting saved.";
  });
}

export async function setTemplateAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await admin.setTemplate(a, str(fd, "key"), str(fd, "body"));
    return "Message wording saved.";
  });
}

export async function resetTemplateAction(_: ActionResult, fd: FormData) {
  return run(async (a) => {
    await admin.resetTemplate(a, str(fd, "key"));
    return "Back to the default wording.";
  });
}
