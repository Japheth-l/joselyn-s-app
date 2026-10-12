import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, PageHeader, Section, VerificationBadge } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { DELIVERY_LEGS, DELIVERY_STATUS, labelOf } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { agentStatus } from "@/server/authz";
import { openDeliveries } from "@/server/services/deliveries";
import { acceptDeliveryAction } from "../../actions/pro";

export const metadata = { title: "Deliveries" };

export default async function ProDeliveriesPage({ searchParams }: { searchParams: Promise<{ released?: string }> }) {
  const actor = await requireActor();
  const sp = await searchParams;
  const status = agentStatus(actor, "RIDER");
  if (!status) {
    return (
      <>
        <PageHeader title="Deliveries" />
        <Empty title="You're not a rider yet" action={<Link href="/pro" className="btn-primary min-h-11">Apply now</Link>}>
          Apply from your work dashboard. Delivery jobs are shown once your account is verified.
        </Empty>
      </>
    );
  }
  const verified = status === "VERIFIED";
  const [jobs, profile, active, recent] = await Promise.all([
    verified ? openDeliveries(actor) : Promise.resolve([]),
    db.agentProfile.findFirst({ where: { userId: actor.userId, kind: "RIDER" }, select: { available: true, serviceLat: true, serviceRadiusKm: true } }),
    db.deliveryAssignment.findMany({
      where: { riderId: actor.userId, status: { in: ["ACCEPTED", "PICKED_UP", "IN_TRANSIT"] } },
      select: { id: true, leg: true, status: true, pickupName: true, dropoffName: true, feeMinor: true, acceptedAt: true },
      orderBy: { acceptedAt: "asc" },
    }),
    db.deliveryAssignment.findMany({
      where: { riderId: actor.userId, status: { in: ["DELIVERED", "FAILED"] } },
      select: { id: true, leg: true, status: true, pickupName: true, feeMinor: true, deliveredAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Deliveries" subtitle="Accept a job to see the drop-off address and the customer's phone number." actions={<VerificationBadge status={status} />} />
      {sp.released && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">You handed the delivery back. It's open to other riders again.</p>}

      {active.length > 0 && (
        <Section title={`My active deliveries (${active.length})`}>
          <ul className="space-y-3">
            {active.map((d) => (
              <li key={d.id}>
                <Link href={`/pro/deliveries/${d.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-stone-200 p-3 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{d.pickupName} → {d.dropoffName}</span>
                    <span className="block text-sm text-stone-600">{labelOf(DELIVERY_LEGS, d.leg)} · {formatMoney(d.feeMinor)}</span>
                  </span>
                  <Badge tone="blue">{labelOf(DELIVERY_STATUS, d.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Open jobs near you">
        {!verified ? (
          <p className="text-sm text-stone-600">Jobs appear here once your account is verified. <Link href="/pro" className="font-semibold text-brand-700 underline">Check your application</Link>.</p>
        ) : (
          <>
            {profile && !profile.available && <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">You're marked as unavailable, so new jobs aren't announced to you. <Link href="/pro" className="font-semibold underline">Change this</Link>.</p>}
            {profile?.serviceLat == null && <p className="text-sm text-stone-600">Set your base on the <Link href="/pro" className="font-semibold text-brand-700 underline">overview</Link> to see how far each pickup is.</p>}
            {jobs.length === 0 ? (
              <p className="text-sm text-stone-600">No open jobs within {profile?.serviceRadiusKm ?? 15} km right now. We'll notify you when one comes up.</p>
            ) : (
              <ul className="space-y-3">
                {jobs.map((j) => (
                  <li key={j.id} className="space-y-3 rounded-lg border border-stone-200 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-words font-semibold">Pick up from {j.pickupName}</p>
                        <p className="text-sm text-stone-600">{labelOf(DELIVERY_LEGS, j.leg)}</p>
                      </div>
                      <p className="text-lg font-bold text-brand-700">{formatMoney(j.feeMinor)}</p>
                    </div>
                    <p className="text-sm text-stone-600">
                      Trip about {j.tripKm} km · {j.fromRiderKm != null ? `pickup about ${j.fromRiderKm} km from your base` : "distance from you unknown"}
                    </p>
                    <ActionForm action={acceptDeliveryAction} className="space-y-2">
                      <input type="hidden" name="assignmentId" value={j.id} />
                      <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Accept job</SubmitButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Section>

      <Section title="Recent deliveries">
        {recent.length === 0 ? (
          <p className="text-sm text-stone-600">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {recent.map((d) => (
              <li key={d.id}>
                <Link href={`/pro/deliveries/${d.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{d.pickupName} · {formatMoney(d.feeMinor)}</span>
                    <span className="block text-xs text-stone-500">{formatDateTime(d.deliveredAt ?? d.createdAt)}</span>
                  </span>
                  <Badge tone={d.status === "DELIVERED" ? "green" : "red"}>{labelOf(DELIVERY_STATUS, d.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
