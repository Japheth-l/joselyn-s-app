import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { formatCedis } from "@/lib/geo";
import { markPayoutPaid } from "@/app/actions/admin";

export default async function AdminPayouts() {
  await requireUser("ADMIN");
  const [pending, paid, revenue] = await Promise.all([
    db.payout.findMany({ where: { status: "PENDING" }, include: { user: { include: { business: true } }, order: { include: { style: true } } }, orderBy: { createdAt: "asc" } }),
    db.payout.findMany({ where: { status: "PAID" }, include: { user: true }, orderBy: { paidAt: "desc" }, take: 50 }),
    db.order.aggregate({ where: { paymentStatus: "PAID" }, _sum: { total: true } }),
  ]);
  const owed = pending.reduce((t, p) => t + p.amount, 0);

  return (
    <div className="space-y-8">
      <h1 className="page-title">Payouts</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card"><p className="text-sm text-stone-500">Collected from clients</p><p className="text-2xl font-bold">{formatCedis(revenue._sum.total ?? 0)}</p></div>
        <div className="card border-gold-400"><p className="text-sm text-stone-500">Owed to partners</p><p className="text-2xl font-bold">{formatCedis(owed)}</p></div>
      </div>

      <section>
        <h2 className="mb-1 text-lg font-semibold">To pay ({pending.length})</h2>
        <p className="mb-3 text-sm text-stone-600">Send Mobile Money to the number shown, then enter the transaction ID to mark it paid. They&apos;ll get an SMS.</p>
        {pending.length === 0 && <p className="card text-stone-600">Nothing to pay right now.</p>}
        <ul className="space-y-2">
          {pending.map((p) => (
            <li key={p.id} className="card flex flex-wrap items-center gap-4 text-sm">
              <div className="min-w-48 flex-1">
                <p className="font-semibold">{p.user.business?.name ?? p.user.name} <span className="font-normal text-stone-500">· {ROLE_LABELS[p.role as Role]}</span></p>
                <p className="text-stone-500">MoMo: {p.user.phone} · {p.order.style?.name ?? "Fabric order"} · completed {p.createdAt.toLocaleDateString("en-GH")}</p>
              </div>
              <p className="text-lg font-bold">{formatCedis(p.amount)}</p>
              <form action={markPayoutPaid.bind(null, p.id)} className="flex gap-2">
                <input name="reference" required minLength={3} placeholder="MoMo transaction ID" className="input w-48" aria-label="Mobile Money transaction ID" />
                <button className="btn-primary">Mark paid</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {paid.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recently paid</h2>
          <ul className="space-y-1 text-sm">
            {paid.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-stone-200 py-2">
                <span>{p.user.name} · {p.reference}</span>
                <span>{formatCedis(p.amount)} · {p.paidAt?.toLocaleDateString("en-GH")}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
