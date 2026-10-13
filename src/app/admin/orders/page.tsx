import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge, DemoBadge, Empty, OrderStatusBadge, PageHeader } from "@/components/ui/basics";
import { ORDER_STATUS, PAYMENT_STATUS, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import { pageOf } from "@/server/queries/admin";
import { requireAdminPage } from "../_lib/guard";
import { Pager } from "../_lib/ui";

export const metadata = { title: "Orders" };
const PER_PAGE = 50;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; number?: string; page?: string }> }) {
  await requireAdminPage("ORDERS");
  const sp = await searchParams;
  const status = sp.status && sp.status in ORDER_STATUS ? sp.status : undefined;
  const num = sp.number ? Number(sp.number.replace(/^#/, "")) : NaN;
  const number = Number.isInteger(num) && num > 0 && num < 2_000_000_000 ? num : undefined;
  const page = pageOf(sp.page);
  const where: Prisma.OrderWhereInput = { ...(status ? { status } : {}), ...(number ? { number } : {}) };
  const rows = await db.order.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE + 1,
    select: {
      id: true, number: true, kind: true, status: true, paymentStatus: true, totalMinor: true, createdAt: true, isDemo: true,
      customer: { select: { name: true } }, business: { select: { name: true } }, style: { select: { name: true } },
    },
  });
  const orders = rows.slice(0, PER_PAGE);

  return (
    <div className="space-y-6">
      <PageHeader title="Orders" subtitle="Newest first." />
      <form method="get" className="card grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input">
            <option value="">Any status</option>
            {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="number">Order number</label>
          <input id="number" name="number" inputMode="numeric" defaultValue={number ?? ""} className="input" placeholder="e.g. 1042" />
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {(status || number) && <Link href="/admin/orders" className="btn-secondary">Clear</Link>}
      </form>
      {orders.length === 0 ? (
        <Empty title="No orders match" />
      ) : (
        <div className="card">
          <ul className="divide-y divide-stone-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-stone-50">
                  <div className="min-w-0">
                    <p className="break-words font-medium">#{o.number} · {o.kind === "FABRIC" ? "Fabric" : o.style?.name ?? "Custom order"}</p>
                    <p className="break-words text-sm text-stone-600">{o.customer.name} → {o.business?.name ?? "no business yet"} · {formatDate(o.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <OrderStatusBadge status={o.status} />
                    <Badge>{labelOf(PAYMENT_STATUS, o.paymentStatus)}</Badge>
                    <DemoBadge show={o.isDemo} />
                    <span className="text-sm font-semibold tabular-nums">{formatMoney(o.totalMinor)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager base="/admin/orders" params={{ status, number: number ? String(number) : undefined }} page={page} hasMore={rows.length > PER_PAGE} />
        </div>
      )}
    </div>
  );
}
