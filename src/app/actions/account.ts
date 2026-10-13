"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { run, type ActionResult } from "@/server/action";
import { invalid } from "@/server/errors";
import { bool, optNum, optStr, str } from "@/server/forms";
import { saveUploads } from "@/server/files";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/session";
import * as accounts from "@/server/services/accounts";
import * as community from "@/server/services/community";
import * as inbox from "@/server/services/inbox";
import * as measurements from "@/server/services/measurements";

// Personal account actions: settings, measurements, notifications and help. Services check ownership.

// ── Settings ──

export async function updateProfileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await accounts.updateProfile(a, { name: str(fd, "name"), phone: str(fd, "phone"), city: str(fd, "city") });
    return "Profile saved.";
  });
}

export async function changePasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    const next = String(fd.get("password") ?? "");
    if (next !== String(fd.get("confirm") ?? "")) throw invalid("The two new passwords don't match.");
    const sv = await accounts.changePassword(a, String(fd.get("current") ?? ""), next);
    // Keep this device signed in with the new session version; every other device is signed out.
    (await cookies()).set(SESSION_COOKIE, await signSession({ userId: a.userId, sv }), sessionCookieOptions);
    return "Password changed. You're still signed in on this device; all other devices have been signed out.";
  });
}

export async function logoutEverywhereAction(_: ActionResult, _fd: FormData): Promise<ActionResult> {
  let done = false;
  const res = await run(async (a) => {
    await accounts.logoutEverywhere(a);
    done = true;
  });
  if (!done) return res;
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

export async function updateNotificationPrefsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    // WhatsApp isn't implemented, so it is always off.
    await accounts.updateNotificationPrefs(a, { sms: bool(fd, "sms"), email: bool(fd, "email"), whatsapp: false });
    return "Notification preferences saved.";
  });
}

export async function addAddressAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await accounts.addAddress(a, { label: str(fd, "label"), addressText: str(fd, "addressText"), lat: optNum(fd, "lat"), lng: optNum(fd, "lng") });
    return "Address saved.";
  });
}

export async function removeAddressAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await accounts.removeAddress(a, str(fd, "addressId"));
    return "Address removed.";
  });
}

export async function deleteAccountAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let done = false;
  const res = await run(async (a) => {
    await accounts.deleteMyAccount(a, String(fd.get("password") ?? ""));
    done = true;
  });
  if (!done) return res;
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

// ── Measurements ──

export async function createMeasurementProfileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await measurements.createProfile(a, str(fd, "label"));
    return "Profile added. Now enter the measurements.";
  });
}

export async function saveOwnMeasurementsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    const unit = str(fd, "unit") === "cm" ? "cm" : "in";
    await measurements.saveOwnMeasurements(a, str(fd, "profileId"), measurements.parseMeasurementForm(fd, unit), str(fd, "notes"));
    return "Measurements saved as a new revision.";
  });
}

export async function confirmRecordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await measurements.confirmRecord(a, str(fd, "recordId"));
    return "Thanks — measurements confirmed.";
  });
}

export async function deleteMeasurementProfileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await measurements.deleteProfile(a, str(fd, "profileId"));
    return "Profile deleted.";
  });
}

// ── Notifications ──

export async function markAllReadAction(_: ActionResult, _fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await inbox.markAllRead(a);
    return "All caught up.";
  });
}

export async function markReadAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await inbox.markRead(a, str(fd, "notificationId"));
    return "Marked as read.";
  });
}

// ── Help ──

export async function openTicketAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await run(async (a) => {
    id = (await community.openTicket(a, str(fd, "subject"), str(fd, "body"), optStr(fd, "orderId"))).id;
  });
  if (id) redirect(`/support/${id}?created=1`);
  return res;
}

export async function replyTicketAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await community.replyTicket(a, str(fd, "ticketId"), str(fd, "body"));
    return "Reply sent.";
  });
}

export async function closeTicketAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await community.closeTicket(a, str(fd, "ticketId"));
    return "Request closed.";
  });
}

export async function addDisputeNoteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    const disputeId = str(fd, "disputeId");
    // Authorise (and find the order) through the service before storing any evidence.
    const d = await community.getDispute(a, disputeId);
    if (["RESOLVED", "REJECTED"].includes(d.status)) throw invalid("This dispute is closed.");
    const files = await saveUploads(a, fd.getAll("evidence"), { purpose: "DISPUTE", orderId: d.orderId, allowPdf: true }, 5);
    const body = str(fd, "body") || (files.length ? "Evidence" : "");
    await community.addDisputeNote(a, disputeId, body, files.map((f) => f.id), false);
    return "Added to the dispute.";
  });
}
