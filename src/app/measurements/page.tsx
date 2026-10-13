import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, PageHeader, Section, type Tone } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { requireActor } from "@/server/auth";
import {
  confirmRecordAction, createMeasurementProfileAction, deleteMeasurementProfileAction, saveOwnMeasurementsAction,
} from "../actions/account";
import { MeasurementFields, MeasurementTable, readValues } from "./measurement-fields";

export const metadata = { title: "My measurements" };

const SOURCE: Record<string, string> = { SELF: "Entered by you", PROFESSIONAL: "Measurement professional", WORKSHOP: "At the workshop", IMPORTED: "Imported" };
const STATUS: Record<string, [string, Tone]> = {
  CONFIRMED: ["Confirmed", "green"],
  SUBMITTED: ["Waiting for you to check", "gold"],
  SUPERSEDED: ["Replaced", "grey"],
};

export default async function MeasurementsPage() {
  const actor = await requireActor();
  const profiles = await db.measurementProfile.findMany({
    where: { ownerId: actor.userId },
    include: { records: { where: { status: { not: "DRAFT" } }, orderBy: { revision: "desc" } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="My measurements" subtitle="Keep measurements for yourself and your family. Only you, the business sewing your order and the professional who measured you can see them." />

      <details className="card">
        <summary className="min-h-10 cursor-pointer py-1 font-semibold text-brand-700">How to measure yourself</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-stone-700">
          <li>Use a soft tape measure and ask someone to help — it's hard to measure your own back and arms.</li>
          <li>Wear light, close-fitting clothes. Stand straight and breathe normally.</li>
          <li>Keep the tape level and snug, but not tight: you should fit one finger underneath.</li>
          <li>Chest/bust: around the fullest part. Waist: around your natural waist, above the belly button. Hips: around the widest part.</li>
          <li>Lengths: shoulder to where you want the top or dress to end; waist to ankle for trousers or skirts.</li>
          <li>Not sure? Choose a home visit from a measurement professional when you order.</li>
        </ul>
      </details>

      {profiles.length === 0 && (
        <Empty title="No measurements saved yet">Add a profile below, for example “Me” or “My son Kojo”, then enter the measurements.</Empty>
      )}

      {profiles.map((p) => {
        const latest = p.records.find((r) => r.status === "CONFIRMED" || r.status === "SUBMITTED") ?? p.records[0];
        const pending = p.records.filter((r) => r.status === "SUBMITTED");
        const latestValues = latest ? readValues(latest.values) : {};
        return (
          <Section key={p.id} title={p.label} actions={latest ? <span className="text-xs text-stone-500">Updated {formatDate(latest.createdAt)}</span> : undefined}>
            {pending.map((r) => (
              <div key={r.id} className="space-y-3 rounded-lg border border-gold-400 bg-gold-100 p-3">
                <p className="text-sm font-semibold text-amber-900">These were taken by a professional — check and confirm</p>
                <MeasurementTable values={readValues(r.values)} />
                {r.notes && <p className="break-words text-sm text-stone-700">Notes: {r.notes}</p>}
                <ActionForm action={confirmRecordAction} className="space-y-2">
                  <input type="hidden" name="recordId" value={r.id} />
                  <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">They look right — confirm</SubmitButton>
                  <p className="text-xs text-stone-600">Something wrong? Message the business from your order before sewing starts.</p>
                </ActionForm>
              </div>
            ))}

            {latest && latest.status !== "SUBMITTED" && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-stone-700">Latest measurements (revision {latest.revision})</p>
                <MeasurementTable values={latestValues} />
              </div>
            )}
            {!latest && <p className="text-sm text-stone-600">No measurements in this profile yet.</p>}

            {p.records.length > 0 && (
              <details className="rounded-lg border border-stone-200 p-3">
                <summary className="min-h-10 cursor-pointer py-2 text-sm font-medium text-stone-700">History ({p.records.length})</summary>
                <ul className="mt-2 divide-y divide-stone-100">
                  {p.records.map((r) => {
                    const [label, tone] = STATUS[r.status] ?? [r.status, "grey" as Tone];
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="font-medium">Revision {r.revision}</span>
                          <span className="block text-xs text-stone-500">{SOURCE[r.source] ?? r.source} · {formatDate(r.createdAt)}</span>
                        </span>
                        <Badge tone={tone}>{label}</Badge>
                      </li>
                    );
                  })}
                </ul>
              </details>
            )}

            <details className="rounded-lg border border-stone-200 p-3">
              <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-brand-700">{latest ? "Enter new measurements" : "Enter measurements"}</summary>
              <ActionForm action={saveOwnMeasurementsAction} className="mt-3 space-y-4">
                <input type="hidden" name="profileId" value={p.id} />
                <p className="text-sm text-stone-600">Enter at least three. Saving creates a new revision; earlier ones are kept.</p>
                <MeasurementFields values={latestValues} idPrefix={`p${p.id}`} />
                <div>
                  <label className="label" htmlFor={`notes-${p.id}`}>Notes (optional)</label>
                  <textarea id={`notes-${p.id}`} name="notes" rows={2} maxLength={500} className="input" placeholder="e.g. I like a loose fit" />
                </div>
                <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Save measurements</SubmitButton>
              </ActionForm>
            </details>

            <ActionForm action={deleteMeasurementProfileAction} className="space-y-2">
              <input type="hidden" name="profileId" value={p.id} />
              <ConfirmButton className="btn-danger min-h-11 w-full sm:w-auto">Delete “{p.label}”</ConfirmButton>
            </ActionForm>
          </Section>
        );
      })}

      {profiles.length < 10 && (
        <Section title="Add a profile">
          <ActionForm action={createMeasurementProfileAction} resetOnSuccess className="space-y-3">
            <div>
              <label className="label" htmlFor="new-label">Whose measurements?</label>
              <input id="new-label" name="label" required maxLength={40} placeholder={profiles.length ? "e.g. My son Kojo" : "Me"} defaultValue={profiles.length ? "" : "Me"} className="input min-h-11" />
            </div>
            <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Add profile</SubmitButton>
          </ActionForm>
        </Section>
      )}
    </div>
  );
}
