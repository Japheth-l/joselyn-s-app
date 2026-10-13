import Link from "next/link";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { formatQty } from "@/lib/qty";
import { Empty, OrderStatusBadge, PageHeader } from "@/components/ui/basics";
import { requireActor } from "@/server/auth";
import { OPEN_STATUSES } from "@/server/order-machine";

export const metadata = { title: "My orders" };

const BANNERS: Record<string, string> = {
  failed: "That payment didn't go through. You can try again from the order.",
  pending: "We're still waiting for the payment provider to confirm your payment. This page updates when it does.",
  unknown: "We couldn't find that payment.",
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const actor = await requireActor();
  const { payment } = await searchParams;
  const orders = await db.order.findMany({
    where: { customerId: actor.userId, status: { not: "DRAFT" } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { style: true, business: true, fabricListing: true, quotations: { where: { status: "SUBMITTED" }, select: { id: true } } },
  });
  const open = orders.filter((o) => (OPEN_STATUSES as string[]).includes(o.status));
  const closed = orders.filter((o) => !(OPEN_STATUSES as string[]).includes(o.status));

  const list = (items: typeof orders) => (
    <ul className="space-y-3">
      {items.map((o) => (
        <li key={o.id}>
          <Link href={`/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 p-4 hover:border-brand-500">
            <div className="min-w-0">
              <p className="font-semibold">#{o.number} · {o.kind === "FABRIC" ? `${o.fabricListing?.name ?? "Fabric"} (${formatQty(o.fabricQtyCenti, o.fabricListing?.unit)})` : o.style?.name ?? "Custom outfit"}</p>
              <p className="truncate text-xs text-stone-500">
                {o.business?.name ?? (o.quotations.length ? `${o.quotations.length} quote${o.quotations.length === 1 ? "" : "s"} to compare` : "Waiting for quotes")} · {formatDate(o.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {o.totalMinor > 0 && <span className="text-sm font-semibold">{formatMoney(o.totalMinor)}</span>}
              <OrderStatusBadge status={o.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="My orders" actions={<Link href="/order/new" className="btn-primary">New outfit</Link>} />
      {payment && BANNERS[payment] && <p role="status" className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">{BANNERS[payment]}</p>}
      {orders.length === 0 ? (
        <Empty title="No orders yet" action={<Link href="/order/new" className="btn-primary">Start an outfit</Link>}>Choose a style and we'll find tailors near you.</Empty>
      ) : (
        <>
          {open.length > 0 && <section className="space-y-3"><h2 className="font-semibold">In progress</h2>{list(open)}</section>}
          {closed.length > 0 && <section className="space-y-3"><h2 className="font-semibold">Finished</h2>{list(closed)}</section>}
        </>
      )}
    </div>
  );
}
