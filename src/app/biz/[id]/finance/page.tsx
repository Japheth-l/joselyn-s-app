import Link from "next/link";
import { Empty, Section } from "@/components/ui/basics";
import { BRAND } from "@/lib/brand";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { partyBalance } from "@/server/ledger";
import { atLeast, businessPage } from "@/server/queries/business";

export const metadata = { title: "Finance" };

const ENTRY_TYPE: Record<string, string> = {
  SETTLEMENT: "Order completed (your share, after commission)",
  REFUND: "Refund recovered after settlement",
  PAYOUT: "Paid out by Mobile Money",
  LEGACY: "Balance carried over",
};

export default async function FinancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, business } = await businessPage(id);
  if (!atLeast(role, "MANAGER")) {
    return <Empty title="Only owners and managers can see finances" />;
  }
  const [balance, entries, payouts] = await Promise.all([
    partyBalance(db, "BUSINESS", id),
    db.ledgerEntry.findMany({ where: { account: "PARTNER_PAYABLE", partyType: "BUSINESS", partyId: id }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.payout.findMany({ where: { partyType: "BUSINESS", partyId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const orderIds = [...new Set(entries.map((e) => e.orderId).filter((x): x is string => !!x))];
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true, businessId: true } }) : [];
  const orderById = new Map(orders.map((o) => [o.id, o]));

  return (
    <div className="space-y-6">
      <Section title="Owed to you now">
        <p className="text-3xl font-bold">{formatMoney(balance)}</p>
        <p className="text-sm text-stone-600">
          When a customer confirms an order is complete, your share (the sewing and fabric amount less {BRAND.name}&apos;s commission) is added here.
          {" "}{BRAND.name} sends payouts by Mobile Money to <span className="font-medium">{business.payoutPhone || business.phone}</span>. Payouts are made by the
          platform team, not automatically. <Link href={`/biz/${id}/profile`} className="text-brand-700 hover:underline">Change the payout number</Link>.
        </p>
        {balance < 0 && <p className="text-sm text-amber-800">A negative balance means a refund was recovered after settlement; it is taken from future earnings.</p>}
      </Section>

      <Section title="Account history">
        {entries.length === 0 ? (
          <Empty title="No earnings yet">Your balance changes when orders are completed, refunded after settlement, or paid out.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {entries.map((e) => {
              const o = e.orderId ? orderById.get(e.orderId) : undefined;
              return (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{ENTRY_TYPE[e.type] ?? e.type}</p>
                    <p className="text-stone-500">
                      {formatDate(e.createdAt)}
                      {o ? <> · {o.businessId === id ? <Link href={`/biz/${id}/orders/${o.id}`} className="text-brand-700 hover:underline">Order #{o.number}</Link> : `Order #${o.number}`}</> : null}
                    </p>
                  </div>
                  <span className={`whitespace-nowrap font-semibold ${e.amountMinor < 0 ? "text-red-700" : "text-stone-900"}`}>{e.amountMinor > 0 ? "+" : ""}{formatMoney(e.amountMinor)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Payouts">
        {payouts.length === 0 ? (
          <p className="text-sm text-stone-600">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{formatDate(p.createdAt)} · Mobile Money to {p.destination}</p>
                  <p className="break-all text-stone-500">Reference {p.reference || "—"} · {p.status === "PAID" ? "Paid" : p.status}</p>
                </div>
                <span className="whitespace-nowrap font-semibold">{formatMoney(p.amountMinor)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
