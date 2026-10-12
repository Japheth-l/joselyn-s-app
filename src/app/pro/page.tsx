import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, PageHeader, Section, VerificationBadge } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { applyAsAgentAction, updateAgentProfileAction } from "../actions/pro";
import { CaptureLocation } from "../settings/capture-location";

export const metadata = { title: "Work dashboard" };

const KINDS = [
  { kind: "MEASURER", title: "Measurement professional", blurb: "Visit customers at home and take their measurements for the tailor. You set your own visit fee.", jobs: "/pro/measurements", jobsLabel: "measurement visits" },
  { kind: "RIDER", title: "Delivery rider", blurb: "Collect finished outfits and fabric from businesses and deliver them to customers.", jobs: "/pro/deliveries", jobsLabel: "delivery jobs" },
] as const;

const VEHICLES = { MOTORBIKE: "Motorbike", CAR: "Car", BICYCLE: "Bicycle", ON_FOOT: "On foot" } as const;

export default async function ProHubPage() {
  const actor = await requireActor();
  const [profiles, applications] = await Promise.all([
    db.agentProfile.findMany({ where: { userId: actor.userId } }),
    db.verificationApplication.findMany({
      where: { applicantId: actor.userId, subjectType: { in: ["MEASURER", "RIDER"] } },
      orderBy: { createdAt: "desc" },
      select: { subjectType: true, status: true, decisionNote: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work with us"
        subtitle={`Earn with ${BRAND.name} as a measurement professional or a delivery rider. Every account is checked by our team before any jobs are shown.`}
      />
      {KINDS.map((k) => {
        const p = profiles.find((x) => x.kind === k.kind);
        const app = applications.find((a) => a.subjectType === k.kind);
        if (!p) {
          return (
            <Section key={k.kind} title={k.title}>
              <p className="text-sm text-stone-600">{k.blurb}</p>
              <ApplyForm kind={k.kind} />
            </Section>
          );
        }
        const verified = p.verificationStatus === "VERIFIED";
        return (
          <Section key={k.kind} title={k.title} actions={<VerificationBadge status={p.verificationStatus} />}>
            {verified ? (
              <p className="text-sm text-stone-700">
                You're verified. <Link href={k.jobs} className="font-semibold text-brand-700 underline">See open {k.jobsLabel} →</Link>
              </p>
            ) : (
              <div className="space-y-2 rounded-lg bg-gold-100 px-3 py-3 text-sm text-amber-900">
                {p.verificationStatus === "PENDING" && (
                  <p>Your application{app ? ` from ${formatDate(app.createdAt)}` : ""} is waiting for review. Jobs only appear after your account is verified. We'll notify you when it has been checked.</p>
                )}
                {p.verificationStatus === "REJECTED" && <p>Your application was not approved, so jobs are not shown to you.</p>}
                {p.verificationStatus === "SUSPENDED" && <p>This account is suspended, so jobs are not shown to you.</p>}
                {app?.status === "NEEDS_INFO" && <p className="font-medium">We need more information before we can verify you.</p>}
                {app?.decisionNote && <p className="break-words">Note from our team: “{app.decisionNote}”</p>}
                {p.verificationStatus !== "PENDING" || app?.status === "NEEDS_INFO" ? (
                  <p><Link href="/support" className="font-semibold underline">Contact support</Link> if you have questions.</p>
                ) : null}
              </div>
            )}
            <ActionForm action={updateAgentProfileAction} className="space-y-4">
              <input type="hidden" name="kind" value={k.kind} />
              <label className="flex min-h-11 items-center gap-3 rounded-lg border border-stone-200 px-3 py-2">
                <input type="checkbox" name="available" defaultChecked={p.available} className="h-5 w-5 accent-brand-600" />
                <span className="text-sm font-medium">I'm available for new jobs</span>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor={`radius-${k.kind}`}>Service radius (km)</label>
                  <input id={`radius-${k.kind}`} name="radius" type="number" inputMode="numeric" min={1} max={100} required defaultValue={p.serviceRadiusKm} className="input min-h-11" />
                  <p className="mt-1 text-xs text-stone-500">Jobs farther than this from your base are not shown.</p>
                </div>
                {k.kind === "MEASURER" && (
                  <div>
                    <label className="label" htmlFor="fee-MEASURER">Your visit fee (GH₵)</label>
                    <input id="fee-MEASURER" name="fee" type="number" inputMode="decimal" min={0} step="0.01" defaultValue={p.feeMinor != null ? (p.feeMinor / 100).toFixed(2) : ""} className="input min-h-11" />
                    <p className="mt-1 text-xs text-stone-500">{p.feeMinor != null ? `Currently ${formatMoney(p.feeMinor)}.` : "Not set yet."}</p>
                  </div>
                )}
                {k.kind === "RIDER" && p.vehicle && (
                  <div className="text-sm">
                    <p className="label">Vehicle</p>
                    <p className="font-medium">{VEHICLES[p.vehicle as keyof typeof VEHICLES] ?? p.vehicle}</p>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <p className="label">Your base</p>
                <p className="text-sm text-stone-600">
                  {p.serviceLat != null && p.serviceLng != null ? `Set (${p.serviceLat.toFixed(3)}, ${p.serviceLng.toFixed(3)}). Distances to jobs are measured from here.` : "Not set. Distances can't be shown until you set a base."}
                </p>
                <CaptureLocation label="Use my current location as my base" note="Optional. Only used to measure distances to jobs; never shown to customers." />
              </div>
              <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Save settings</SubmitButton>
            </ActionForm>
          </Section>
        );
      })}
    </div>
  );
}

function ApplyForm({ kind }: { kind: "MEASURER" | "RIDER" }) {
  const id = (n: string) => `${n}-${kind}`;
  return (
    <ActionForm action={applyAsAgentAction} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <label className="label" htmlFor={id("card")}>Ghana Card number</label>
        <input id={id("card")} name="ghanaCardNumber" required placeholder="GHA-123456789-0" autoComplete="off" className="input min-h-11 uppercase" />
      </div>
      <div>
        <label className="label" htmlFor={id("exp")}>Your experience</label>
        <textarea id={id("exp")} name="experience" rows={3} maxLength={1000} className="input"
          placeholder={kind === "MEASURER" ? "e.g. 5 years as a seamstress, I take measurements for church groups…" : "e.g. 3 years delivering for shops in Accra…"} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "RIDER" ? (
          <div>
            <label className="label" htmlFor={id("vehicle")}>How do you travel?</label>
            <select id={id("vehicle")} name="vehicle" defaultValue="MOTORBIKE" className="input min-h-11">
              {Object.entries(VEHICLES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor={id("fee")}>Your visit fee (GH₵)</label>
            <input id={id("fee")} name="fee" type="number" inputMode="decimal" min={0} step="0.01" className="input min-h-11" />
          </div>
        )}
        <div>
          <label className="label" htmlFor={id("radius")}>Service radius (km)</label>
          <input id={id("radius")} name="radius" type="number" inputMode="numeric" min={1} max={100} defaultValue={15} required className="input min-h-11" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={id("docs")}>Photo of your Ghana Card (front and back)</label>
        <input id={id("docs")} name="documents" type="file" multiple required accept="image/jpeg,image/png,image/webp,application/pdf" className="input min-h-11" />
        <p className="mt-1 text-xs text-stone-500">JPG, PNG, WebP or PDF, up to 5 files of 5 MB. Only our verification team can see them.</p>
      </div>
      <p className="text-sm text-stone-600">
        <Badge tone="gold">After you apply</Badge>{" "}
        Our team checks your details. Jobs only appear once your account is verified.
      </p>
      <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Apply</SubmitButton>
    </ActionForm>
  );
}
