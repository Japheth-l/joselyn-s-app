import Link from "next/link";
import { Empty, PageHeader, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { partyBalance } from "@/server/ledger";

export const metadata = { title: "Earnings" };

export default async function ProEarningsPage() {
  const actor = await requireActor();
  if (actor.agents.length === 0) {
    return (
      <>
        <PageHeader title="Earnings" />
        <Empty title="No earnings yet" action={<Link href="/pro" className="btn-primary min-h-11">Become a professional</Link>}>
          Earnings appear here once you work as a measurement professional or rider.
        </Empty>
      </>
    );
  }
  const where = { account: "PARTNER_PAYABLE", partyType: "USER", partyId: actor.userId };
  const [balance, entries, payouts] = await Promise.all([
    partyBalance(db, "USER", actor.userId),
    db.ledgerEntry.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 }),
    db.payout.findMany({ where: { partyType: "USER", partyId: actor.userId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const orderIds = [...new Set(entries.map((e) => e.orderId).filter((x): x is string => !!x))];
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }) : [];
  const orderNo = new Map(orders.map((o) => [o.id, o.number]));

  return (
    <div className="space-y-6">
      <PageHeader title="Earnings" />
      <section className="card space-y-1">
        <p className="text-sm text-stone-600">Owed to you</p>
        <p className="text-3xl font-bold text-brand-700">{formatMoney(balance)}</p>
        <p className="text-sm text-stone-600">
          Payouts are sent manually by our finance team to your Mobile Money number ({actor.phone || "not set"}). They are not automatic.
          {" "}<Link href="/settings" className="font-semibold text-brand-700 underline">Check your phone number</Link>.
        </p>
      </section>

      <Section title="Earnings history">
        {entries.length === 0 ? (
          <p className="text-sm text-stone-600">Nothing yet. Fees are added once the order they belong to is completed.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="break-words font-medium">{e.memo || e.type.replace(/_/g, " ").toLowerCase()}</p>
                  <p className="text-xs text-stone-500">{formatDate(e.createdAt)}{e.orderId && orderNo.has(e.orderId) ? ` · Order #${orderNo.get(e.orderId)}` : ""}</p>
                </div>
                <p className={`shrink-0 font-semibold ${e.amountMinor < 0 ? "text-red-700" : "text-brand-700"}`}>{e.amountMinor > 0 ? "+" : ""}{formatMoney(e.amountMinor)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Payouts received">
        {payouts.length === 0 ? (
          <p className="text-sm text-stone-600">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{p.method === "MOBILE_MONEY" ? "Mobile Money" : p.method} to {p.destination}</p>
                  <p className="break-words text-xs text-stone-500">{formatDate(p.createdAt)} · Ref {p.reference || "—"} · {p.status.toLowerCase()}</p>
                </div>
                <p className="shrink-0 font-semibold">{formatMoney(p.amountMinor)}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
