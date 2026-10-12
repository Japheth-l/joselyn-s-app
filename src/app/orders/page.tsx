import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCedis } from "@/lib/geo";
import { StatusBadge } from "@/components/order-status";

export default async function MyOrders({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  const user = await requireUser("CLIENT");
  const orders = await db.order.findMany({
    where: { clientId: user.id },
    include: { style: true, material: true, business: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">My orders</h1>
        <div className="flex gap-2">
          <Link href="/fabrics" className="btn-secondary">Buy fabric</Link>
          <Link href="/order/new" className="btn-primary">+ New outfit</Link>
        </div>
      </div>

      {payment === "failed" && (
        <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          We couldn&apos;t confirm your payment. If money left your account, it will show here within a few minutes; otherwise please try again.
        </p>
      )}
      {orders.length === 0 ? (
        <div className="card text-center">
          <p className="text-4xl">🧵</p>
          <p className="mt-2 font-semibold">Welcome, {user.name.split(" ")[0]}!</p>
          <p className="text-stone-600">You haven&apos;t ordered anything yet.</p>
          <Link href="/order/new" className="btn-primary mt-4">Order your first outfit</Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="card flex flex-wrap items-center justify-between gap-3 hover:border-brand-500">
                <div>
                  <p className="font-semibold">
                    {o.kind === "SEW" ? `${o.style?.icon} ${o.style?.name}` : `🧶 ${o.yards} yards of ${o.material?.name}`}
                  </p>
                  <p className="text-sm text-stone-500">{o.business.name} · {o.createdAt.toLocaleDateString("en-GH")}</p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-semibold">{formatCedis(o.total)}</span>
                  {o.paymentStatus === "UNPAID" && !["PLACED", "DECLINED", "CANCELLED"].includes(o.status) && (
                    <span className="badge bg-gold-400 text-stone-900">Pay now</span>
                  )}
                  <StatusBadge status={o.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
