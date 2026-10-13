import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageHeader, Section } from "@/components/ui/basics";
import { APPOINTMENT_STATUS, DELIVERY_STATUS, DISPUTE_STATUS, ORDER_STATUS, labelOf } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { addDays, formatDate, parseLocalDate } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { isAdmin } from "@/server/authz";
import { adminQueues } from "@/server/queries/admin";
import { report } from "@/server/services/admin";
import { Stat } from "./_lib/ui";

export const metadata = { title: "Overview" };

const FALLBACK: [string, Parameters<typeof isAdmin>[1]][] = [
  ["/admin/verifications", "VERIFY"], ["/admin/users", "USERS"], ["/admin/orders", "ORDERS"], ["/admin/disputes", "DISPUTES"],
  ["/admin/finance", "FINANCE"], ["/admin/catalogue", "CATALOGUE"], ["/admin/settings", "CONFIG"],
];

const ymd = (d: Date) => d.toISOString().slice(0, 10);

function Counts({ rows, labels }: { rows: Record<string, number>; labels: Record<string, string | { label: string }> }) {
  const entries = Object.entries(rows).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return <p className="text-sm text-stone-500">None recorded in this period.</p>;
  return (
    <ul className="divide-y divide-stone-100 text-sm">
      {entries.map(([k, v]) => (
        <li key={k} className="flex justify-between gap-3 py-1.5"><span className="min-w-0 break-words">{labelOf(labels, k)}</span><span className="font-semibold tabular-nums">{v}</span></li>
      ))}
    </ul>
  );
}

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; demo?: string }> }) {
  const actor = await requireActor();
  if (!isAdmin(actor, "AUDIT")) {
    const first = FALLBACK.find(([, p]) => isAdmin(actor, p));
    if (first) redirect(first[0]);
    notFound();
  }
  const sp = await searchParams;
  const today = parseLocalDate(ymd(new Date()))!;
  const toDay = (sp.to && parseLocalDate(sp.to)) || today;
  const fromDay = (sp.from && parseLocalDate(sp.from)) || addDays(toDay, -29);
  const includeDemo = sp.demo === "1";
  const [r, q] = await Promise.all([report(actor, fromDay, addDays(toDay, 1), includeDemo), adminQueues()]);
  const valid = fromDay <= toDay;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" subtitle={<>Activity from <strong>{formatDate(fromDay)}</strong> to <strong>{formatDate(toDay)}</strong> (Accra time).</>} />

      <form method="get" className="card grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="from">From</label>
          <input id="from" name="from" type="date" defaultValue={ymd(fromDay)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input id="to" name="to" type="date" defaultValue={ymd(toDay)} className="input" />
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="demo" value="1" defaultChecked={includeDemo} className="h-4 w-4" />
          Include demo data
        </label>
        <button type="submit" className="btn-primary">Show</button>
        <p className="text-xs text-stone-600 sm:col-span-4">
          {includeDemo
            ? "Demo (seeded example) records are INCLUDED in these figures."
            : "Demo (seeded example) records are excluded unless you tick “Include demo data”."}
        </p>
      </form>

      {!valid && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">The start date is after the end date, so nothing is counted.</p>}

      <Section title="Needs attention now">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Verifications waiting" value={q.verifications} href={isAdmin(actor, "VERIFY") ? "/admin/verifications" : undefined} />
          <Stat label="Open disputes" value={q.disputes} href={isAdmin(actor, "DISPUTES") ? "/admin/disputes" : undefined} />
          <Stat label="Open support requests" value={q.tickets} href={isAdmin(actor, "DISPUTES") ? "/admin/support" : undefined} />
          <Stat label="Refunds to send by MoMo" value={q.refundsProcessing} href={isAdmin(actor, "FINANCE") ? "/admin/finance" : undefined} />
          <Stat label="Failed refunds" value={q.refundsFailed} href={isAdmin(actor, "FINANCE") ? "/admin/finance" : undefined} />
          <Stat label="Styles to review" value={q.pendingStyles} href={isAdmin(actor, "CATALOGUE") ? "/admin/catalogue?status=PENDING" : undefined} />
        </div>
        <p className="text-xs text-stone-500">Queues are current totals (all dates, demo records included).</p>
      </Section>

      <Section title="Money">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={`Collected (${r.money.paymentCount} payments)`} value={formatMoney(r.money.collectedMinor)} />
          <Stat label={`Refunded (${r.money.refundCount} refunds)`} value={formatMoney(r.money.refundedMinor)} />
          <Stat label="Platform revenue" value={formatMoney(r.money.platformRevenueMinor)} />
        </div>
        <p className="text-xs text-stone-500">Collected counts payments confirmed by the provider in the period. Platform revenue is commission and service fees written to the ledger when orders were settled.</p>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Orders">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Created" value={r.orders.created} />
            <Stat label="Completed" value={r.orders.completed} />
            <Stat label="Median days to complete" value={r.orders.medianDaysToComplete == null ? "—" : r.orders.medianDaysToComplete.toFixed(1)} />
          </div>
          <h3 className="text-sm font-semibold text-stone-700">Orders created in the period, by current status</h3>
          <Counts rows={r.orders.byStatus} labels={ORDER_STATUS} />
        </Section>

        <Section title="Disputes">
          <Stat label="Opened" value={r.disputes.opened} />
          <Counts rows={r.disputes.byStatus} labels={DISPUTE_STATUS} />
        </Section>

        <Section title="Deliveries">
          <Counts rows={r.deliveries} labels={DELIVERY_STATUS} />
        </Section>

        <Section title="Measurement appointments">
          <Counts rows={r.appointments} labels={APPOINTMENT_STATUS} />
        </Section>

        <Section title="Growth">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="New users" value={r.growth.newUsers} />
            <Stat label="New businesses" value={r.growth.newBusinesses} />
          </div>
        </Section>
      </div>

      <p className="text-sm text-stone-600">Every figure is computed from recorded data only. See the <Link href="/admin/audit" className="font-medium text-brand-700 hover:underline">audit log</Link> for who changed what.</p>
    </div>
  );
}
