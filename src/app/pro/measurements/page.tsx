import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, PageHeader, Section, VerificationBadge } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { APPOINTMENT_STATUS, labelOf } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatDateTime, formatTime } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { agentStatus } from "@/server/authz";
import { measurementOffers } from "@/server/services/appointments";
import { acceptAppointmentAction } from "../../actions/pro";

export const metadata = { title: "Measurement visits" };

export default async function ProMeasurementsPage({ searchParams }: { searchParams: Promise<{ released?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const status = agentStatus(actor, "MEASURER");
  if (!status) {
    return (
      <>
        <PageHeader title="Measurement visits" />
        <Empty title="You're not a measurement professional yet" action={<Link href="/pro" className="btn-primary min-h-11">Apply now</Link>}>
          Apply from your work dashboard. Visits are shown once your account is verified.
        </Empty>
      </>
    );
  }
  const verified = status === "VERIFIED";
  const [offers, profile, upcoming, recent] = await Promise.all([
    verified ? measurementOffers(actor) : Promise.resolve([]),
    db.agentProfile.findFirst({ where: { userId: actor.userId, kind: "MEASURER" }, select: { available: true, serviceLat: true, serviceRadiusKm: true } }),
    db.appointment.findMany({
      where: { professionalId: actor.userId, status: "ACCEPTED" },
      include: { order: { select: { number: true, style: { select: { name: true } } } } },
      orderBy: { windowStart: "asc" },
    }),
    db.appointment.findMany({
      where: { professionalId: actor.userId, status: { in: ["COMPLETED", "FAILED"] } },
      include: { order: { select: { number: true, style: { select: { name: true } } } } },
      orderBy: { windowStart: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Measurement visits" subtitle="Accept a visit to see the customer's name, phone number and address." actions={<VerificationBadge status={status} />} />
      {sp.released && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">You handed the visit back. It's open to other professionals again.</p>}

      {verified && upcoming.length > 0 && (
        <Section title={`My upcoming visits (${upcoming.length})`}>
          <ul className="space-y-3">
            {upcoming.map((a) => (
              <li key={a.id}>
                <Link href={`/pro/measurements/${a.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.order?.style?.name ?? "Garment"}{a.order ? ` · Order #${a.order.number}` : ""}</span>
                    <span className="block text-sm text-stone-600">{formatDateTime(a.windowStart)} – {formatTime(a.windowEnd)}</span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-brand-700">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Open visits near you">
        {!verified ? (
          <p className="text-sm text-stone-600">Visits appear here once your account is verified. <Link href="/pro" className="font-semibold text-brand-700 underline">Check your application</Link>.</p>
        ) : (
          <>
            {profile && !profile.available && <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">You're marked as unavailable, so customers' visits aren't announced to you. <Link href="/pro" className="font-semibold underline">Change this</Link>.</p>}
            {profile?.serviceLat == null && <p className="text-sm text-stone-600">Set your base on the <Link href="/pro" className="font-semibold text-brand-700 underline">overview</Link> to see how far each visit is.</p>}
            {offers.length === 0 ? (
              <p className="text-sm text-stone-600">No open visits within {profile?.serviceRadiusKm ?? 15} km right now. We'll notify you when one comes up.</p>
            ) : (
              <ul className="space-y-3">
                {offers.map((o) => (
                  <li key={o.id} className="space-y-3 rounded-lg border border-stone-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold break-words">{o.garment}</p>
                        <p className="text-sm text-stone-600">{formatDateTime(o.windowStart)} – {formatTime(o.windowEnd)}</p>
                      </div>
                      <p className="text-lg font-bold text-brand-700">{formatMoney(o.feeMinor)}</p>
                    </div>
                    <p className="text-sm text-stone-600">{o.distanceKm != null ? `About ${o.distanceKm} km from your base` : "Distance unknown"} · {o.measurementKeys.length} measurements needed</p>
                    <ActionForm action={acceptAppointmentAction} className="space-y-2">
                      <input type="hidden" name="appointmentId" value={o.id} />
                      <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Accept visit</SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section title="Recent visits">
        {recent.length === 0 ? (
          <p className="text-sm text-stone-600">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recent.map((a) => (
              <li key={a.id}>
                <Link href={`/pro/measurements/${a.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{a.order?.style?.name ?? "Garment"}{a.order ? ` · #${a.order.number}` : ""}</span>
                    <span className="block text-xs text-stone-500">{formatDateTime(a.windowStart)}</span>
                  </span>
                  <Badge tone={a.status === "COMPLETED" ? "green" : "red"}>{labelOf(APPOINTMENT_STATUS, a.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
