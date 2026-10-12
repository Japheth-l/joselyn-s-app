import Link from "next/link";
import { Empty, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { labelOf, ORDER_STATUS } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDateTime } from "@/lib/time";
import { partyBalance } from "@/server/ledger";
import { atLeast, availableCenti, businessPage, fabricToConfirmWhere, lowStockThreshold, openQuoteRequestsWhere } from "@/server/queries/business";

export const metadata = { title: "Business overview" };

function Tile({ label, value, href, hint }: { label: string; value: string | number; href?: string; hint?: string }) {
  const inner = (
    <>
      <p className="text-sm text-stone-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </>
  );
  return href ? <Link href={href} className="card block p-4 hover:border-brand-500">{inner}</Link> : <div className="card p-4">{inner}</div>;
}

export default async function BusinessOverviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { role, business } = await businessPage(id);
  const canSeeMoney = atLeast(role, "MANAGER");
  const base = `/biz/${id}`;

  const [quoteRequests, fabricToConfirm, inProduction, ready, listings, balance, events] = await Promise.all([
    db.quotation.count({ where: openQuoteRequestsWhere(id) }),
    db.order.count({ where: fabricToConfirmWhere(id) }),
    db.order.count({ where: { businessId: id, status: { in: ["IN_PRODUCTION", "QUALITY_CHECK"] } } }),
    db.order.count({ where: { businessId: id, status: "READY" } }),
    db.fabricListing.findMany({ where: { businessId: id, status: "ACTIVE" }, select: { id: true, name: true, unit: true, qtyOnHandCenti: true, qtyReservedCenti: true } }),
    canSeeMoney ? partyBalance(db, "BUSINESS", id) : Promise.resolve(null),
    db.orderEvent.findMany({ where: { order: { businessId: id } }, include: { order: { select: { id: true, number: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const lowStock = listings.filter((l) => availableCenti(l) < lowStockThreshold(l.unit));
  const sellsFabric = business.kinds.includes("FABRIC_SELLER") || listings.length > 0;

  return (
    <div className="space-y-6">
      {sp.created && (
        <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">
          Your business is registered and your documents were sent for review. Next, add the styles you sew and your fabric.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Quote requests to answer" value={quoteRequests} href={`${base}/orders`} />
        {sellsFabric && <Tile label="Fabric orders to confirm" value={fabricToConfirm} href={`${base}/orders`} />}
        <Tile label="In production" value={inProduction} href={`${base}/orders?tab=active`} />
        <Tile label="Ready for handover" value={ready} href={`${base}/orders?tab=active`} />
        <Tile label="Low-stock fabrics" value={lowStock.length} href={`${base}/inventory`} hint="Less than 3 yards available" />
        {balance != null && <Tile label="Owed to you" value={formatMoney(balance)} href={`${base}/finance`} />}
      </div>

      {lowStock.length > 0 && (
        <Section title="Running low">
          <ul className="divide-y divide-stone-100 text-sm">
            {lowStock.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`${base}/inventory/${l.id}`} className="min-w-0 truncate font-medium text-brand-700 hover:underline">{l.name}</Link>
                <span className="text-stone-600">{formatQty(availableCenti(l), l.unit)} available</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Recent order activity">
        {events.length === 0 ? (
          <Empty title="No order activity yet">When customers accept your quotes or buy your fabric, updates appear here.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {events.map((e) => (
              <li key={e.id} className="py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <Link href={`${base}/orders/${e.order.id}`} className="font-medium text-brand-700 hover:underline">Order #{e.order.number}</Link>
                  <span className="text-xs text-stone-500">{formatDateTime(e.createdAt)}</span>
                </div>
                <p className="break-words text-stone-700">
                  {e.toStatus ? labelOf(ORDER_STATUS, e.toStatus) : e.type.charAt(0) + e.type.slice(1).toLowerCase()}
                  {e.note ? ` · ${e.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
