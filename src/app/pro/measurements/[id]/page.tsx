import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, Dl, PageHeader, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { APPOINTMENT_STATUS, MEASUREMENT_FIELDS, labelOf } from "@/lib/enums";
import { directionsUrl } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { AppError } from "@/server/errors";
import { getAppointmentForProfessional } from "@/server/services/appointments";
import {
  correctMeasurementsAction, failAppointmentAction, releaseAppointmentAction, submitAppointmentMeasurementsAction,
} from "../../../actions/pro";
import { MeasurementFields, MeasurementTable, readValues } from "../../../measurements/measurement-fields";
import { IntentButton } from "../../intent-button";

export const metadata = { title: "Measurement visit" };

export default async function ProVisitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ accepted?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  // The service only returns the visit to the professional assigned to it.
  const res = await getAppointmentForProfessional(actor, id).catch((e) => {
    if (e instanceof AppError) return null;
    throw e;
  });
  if (!res) notFound();
  const { ap, draft } = res;
  const required = (ap.order?.style?.measurementKeys ?? []).filter((k) => k in MEASUREMENT_FIELDS);
  const [profile, submitted] = await Promise.all([
    ap.profileId ? db.measurementProfile.findUnique({ where: { id: ap.profileId }, select: { label: true } }) : null,
    ap.status === "COMPLETED"
      ? db.measurementRecord.findFirst({ where: { appointmentId: ap.id, status: { not: "DRAFT" } }, orderBy: { revision: "desc" } })
      : null,
  ]);
  const firstName = ap.customer.name.split(/\s+/)[0] || ap.customer.name;
  const statusTone = ap.status === "COMPLETED" ? "green" : ap.status === "ACCEPTED" ? "blue" : ap.status === "FAILED" ? "red" : "grey";
  const sewingStarted = !ap.order || !["AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED"].includes(ap.order.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${ap.order?.style?.name ?? "Measurement visit"}`}
        subtitle={ap.order ? `Order #${ap.order.number}` : undefined}
        back={{ href: "/pro/measurements", label: "Measurement visits" }}
        actions={<Badge tone={statusTone}>{labelOf(APPOINTMENT_STATUS, ap.status)}</Badge>}
      />
      {sp.accepted && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Visit accepted. The customer has been told you're coming. Call them if you need directions.</p>}

      <Section title="Visit details">
        <Dl items={[
          ["Customer", firstName],
          ["When", `${formatDateTime(ap.windowStart)} – ${formatTime(ap.windowEnd)}`],
          ["Measuring", profile?.label ?? "The customer"],
          ["Your fee", formatMoney(ap.feeMinor)],
          ["Address", ap.status !== "ACCEPTED" ? "Hidden once the visit is over" : ap.addressText || "No address text given — call the customer."],
        ]} />
        {ap.status === "ACCEPTED" && (
          <div className="grid gap-2 sm:flex sm:flex-wrap">
            {ap.customer.phone && <a href={`tel:${ap.customer.phone.replace(/\s+/g, "")}`} className="btn-primary min-h-11"><span aria-hidden>📞</span> Call {firstName} ({ap.customer.phone})</a>}
            {ap.lat != null && ap.lng != null && (
              <a href={directionsUrl(ap.lat, ap.lng)} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-11"><span aria-hidden>🗺️</span> Directions</a>
            )}
          </div>
        )}
        {required.length > 0 && (
          <div className="text-sm">
            <p className="font-medium text-stone-700">Measurements this style needs</p>
            <p className="text-stone-600">{required.map((k) => MEASUREMENT_FIELDS[k as keyof typeof MEASUREMENT_FIELDS]).join(", ")}</p>
          </div>
        )}
      </Section>

      {ap.status === "ACCEPTED" && (
        <>
          <Section title="Measurements">
            <p className="text-sm text-stone-600">Save a draft as you go. Submit when you're done; the customer is then asked to check them and the visit is marked complete.</p>
            {draft && <p className="text-sm text-stone-600"><Badge tone="gold">Draft</Badge> Last saved {formatDateTime(draft.createdAt)}.</p>}
            <ActionForm action={submitAppointmentMeasurementsAction} className="space-y-4">
              <input type="hidden" name="appointmentId" value={ap.id} />
              <MeasurementFields required={required.length ? required : undefined} values={draft ? readValues(draft.values) : {}} />
              <div>
                <label className="label" htmlFor="notes">Notes for the tailor (optional)</label>
                <textarea id="notes" name="notes" rows={3} maxLength={500} defaultValue={draft?.notes ?? ""} className="input" placeholder="e.g. prefers a loose fit around the waist" />
              </div>
              <div className="grid gap-2 sm:flex">
                <IntentButton value="draft" className="btn-secondary min-h-11">Save draft</IntentButton>
                <IntentButton value="submit" className="btn-primary min-h-11">Submit measurements</IntentButton>
              </div>
            </ActionForm>
          </Section>

          <Section title="Problems with this visit">
            <ActionForm action={failAppointmentAction} className="space-y-3">
              <input type="hidden" name="appointmentId" value={ap.id} />
              <div>
                <label className="label" htmlFor="fail-reason">Couldn't do the visit? Say what happened</label>
                <input id="fail-reason" name="reason" required maxLength={300} className="input min-h-11" placeholder="e.g. customer not home, no answer on phone" />
              </div>
              <ConfirmButton className="btn-danger min-h-11 w-full sm:w-auto">Couldn't do the visit</ConfirmButton>
            </ActionForm>
            <ActionForm action={releaseAppointmentAction} className="space-y-2 border-t border-stone-100 pt-4">
              <input type="hidden" name="appointmentId" value={ap.id} />
              <p className="text-sm text-stone-600">Can't make it? Hand the visit back so another professional can take it. Only possible more than 2 hours before the visit.</p>
              <ConfirmButton className="btn-secondary min-h-11 w-full sm:w-auto">Hand back this visit</ConfirmButton>
            </ActionForm>
          </Section>
        </>
      )}

      {ap.status === "COMPLETED" && (
        <Section title="Submitted measurements">
          {submitted ? (
            <>
              <p className="text-sm text-stone-600">Revision {submitted.revision}, {formatDateTime(submitted.createdAt)} · {submitted.status === "CONFIRMED" ? "confirmed by the customer" : submitted.status === "SUBMITTED" ? "waiting for the customer to confirm" : "replaced by a later revision"}</p>
              <MeasurementTable values={readValues(submitted.values)} />
              {submitted.notes && <p className="break-words text-sm text-stone-600">Notes: {submitted.notes}</p>}
            </>
          ) : <p className="text-sm text-stone-600">No submitted record found.</p>}
          {sewingStarted ? (
            <p className="text-sm text-stone-600">Sewing has started, so these measurements can no longer be corrected here. Contact the business through the order if something is wrong.</p>
          ) : (
            <details className="rounded-lg border border-stone-200 p-3">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-brand-700">Correct a mistake</summary>
              <ActionForm action={correctMeasurementsAction} className="mt-3 space-y-4">
                <input type="hidden" name="appointmentId" value={ap.id} />
                <p className="text-sm text-stone-600">This creates a new revision; the old one is kept for the record. The customer and business are told.</p>
                <MeasurementFields required={required.length ? required : undefined} values={submitted ? readValues(submitted.values) : {}} idPrefix="fix" />
                <div>
                  <label className="label" htmlFor="fix-reason">What are you correcting?</label>
                  <input id="fix-reason" name="reason" required maxLength={300} className="input min-h-11" placeholder="e.g. waist was entered in cm instead of inches" />
                </div>
                <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Submit correction</SubmitButton>
              </ActionForm>
            </details>
          )}
        </Section>
      )}

      {ap.status === "FAILED" && (
        <Section title="Visit failed">
          <p className="break-words text-sm text-stone-700">{ap.failureReason || "No reason recorded."}</p>
          <p className="text-sm text-stone-600">The customer has been asked to choose a new time.</p>
        </Section>
      )}
    </div>
  );
}
