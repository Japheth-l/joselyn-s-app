"use server";

import { redirect } from "next/navigation";
import { run, type ActionResult } from "@/server/action";
import { bool, optNum, optStr, str } from "@/server/forms";
import { saveUploads } from "@/server/files";
import { applyAsAgent, updateAgentProfile } from "@/server/services/accounts";
import * as appointments from "@/server/services/appointments";
import * as deliveries from "@/server/services/deliveries";
import { parseMeasurementForm } from "@/server/services/measurements";

// Measurement professional and rider actions. Every service re-checks that the actor may do this
// (verified, and assigned to the job); the ids in hidden inputs are never trusted for access.

const kindOf = (fd: FormData) => (str(fd, "kind") === "RIDER" ? "RIDER" : "MEASURER") as "MEASURER" | "RIDER";
const unitOf = (fd: FormData) => (str(fd, "unit") === "cm" ? "cm" : "in") as "in" | "cm";

export async function applyAsAgentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const kind = kindOf(fd);
    const docs = await saveUploads(actor, fd.getAll("documents"), { purpose: "VERIFICATION", allowPdf: true }, 5);
    await applyAsAgent(
      actor, kind,
      {
        ghanaCardNumber: str(fd, "ghanaCardNumber"),
        experience: optStr(fd, "experience"),
        vehicle: kind === "RIDER" ? optStr(fd, "vehicle") : undefined,
        feeCedis: kind === "MEASURER" ? optNum(fd, "fee") : undefined,
        serviceRadiusKm: optNum(fd, "radius"),
      },
      docs.map((d) => d.id),
    );
    return "Application sent. We'll let you know when your account has been checked.";
  });
}

export async function updateAgentProfileAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (actor) => {
    const kind = kindOf(fd);
    await updateAgentProfile(actor, kind, {
      available: bool(fd, "available"),
      serviceRadiusKm: optNum(fd, "radius") ?? 15,
      feeCedis: kind === "MEASURER" ? optNum(fd, "fee") : undefined,
      lat: optNum(fd, "lat"),
      lng: optNum(fd, "lng"),
    });
    return "Settings saved.";
  });
}

// ── Measurement visits ──

const apptId = (fd: FormData) => str(fd, "appointmentId");

export async function acceptAppointmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await run(async (a) => {
    await appointments.acceptAppointment(a, apptId(fd));
    id = apptId(fd);
  });
  if (id) redirect(`/pro/measurements/${id}?accepted=1`);
  return res;
}

export async function submitAppointmentMeasurementsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    const draft = str(fd, "intent") === "draft";
    await appointments.submitAppointmentMeasurements(a, apptId(fd), parseMeasurementForm(fd, unitOf(fd)), { draft, notes: optStr(fd, "notes") });
    return draft ? "Draft saved. You can finish it later." : "Measurements submitted. The customer will be asked to check them.";
  });
}

export async function correctMeasurementsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await appointments.correctMeasurements(a, apptId(fd), parseMeasurementForm(fd, unitOf(fd)), str(fd, "reason"));
    return "Correction submitted. The customer and the business have been told.";
  });
}

export async function failAppointmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await appointments.failAppointment(a, apptId(fd), str(fd, "reason"));
    return "Recorded. The customer has been asked to choose a new time.";
  });
}

export async function releaseAppointmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let done = false;
  const res = await run(async (a) => {
    await appointments.releaseAppointment(a, apptId(fd));
    done = true;
  });
  if (done) redirect("/pro/measurements?released=1");
  return res;
}

// ── Deliveries ──

const legId = (fd: FormData) => str(fd, "assignmentId");

export async function acceptDeliveryAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let id = "";
  const res = await run(async (a) => {
    await deliveries.acceptDelivery(a, legId(fd));
    id = legId(fd);
  });
  if (id) redirect(`/pro/deliveries/${id}?accepted=1`);
  return res;
}

export async function markPickedUpAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => { await deliveries.markPickedUp(a, legId(fd)); return "Marked as picked up."; });
}

export async function markInTransitAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => { await deliveries.markInTransit(a, legId(fd)); return "The customer has been told you're on the way."; });
}

export async function markDeliveredAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => { await deliveries.markDelivered(a, legId(fd), str(fd, "code")); return "Delivered. Thank you!"; });
}

export async function reportDeliveryFailureAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return run(async (a) => {
    await deliveries.reportDeliveryFailure(a, legId(fd), str(fd, "reason"), str(fd, "details").slice(0, 250));
    return "Reported. Return the item to the pickup point; the business and customer have been told.";
  });
}

export async function releaseDeliveryAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  let done = false;
  const res = await run(async (a) => {
    await deliveries.releaseDelivery(a, legId(fd));
    done = true;
  });
  if (done) redirect("/pro/deliveries?released=1");
  return res;
}
