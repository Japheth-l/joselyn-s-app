import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PLATFORM_COMMISSION } from "@/lib/constants";
import { formatCedis } from "@/lib/geo";

export default async function EarningsPage() {
  const user = await requireUser("BUSINESS", "MEASURER", "RIDER");
  const payouts = await db.payout.findMany({
    where: { userId: user.id },
    include: { order: { include: { style: true, material: true, client: true } } },
    orderBy: { createdAt: "desc" },
  });
  const sum = (status: string) => payouts.filter((p) => p.status === status).reduce((t, p) => t + p.amount, 0);

  return (
    <div className="space-y-6">
      <h1 className="page-title">Earnings</h1>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting to be paid" value={formatCedis(sum("PENDING"))} highlight />
        <Stat label="Paid to you" value={formatCedis(sum("PAID"))} />
        <Stat label="Completed jobs" value={String(payouts.length)} />
      </div>
      <p className="text-sm text-stone-600">
        We send your earnings by Mobile Money to <strong>{user.phone}</strong> after each order is completed.
        {user.role === "BUSINESS" && ` Ntoma keeps ${PLATFORM_COMMISSION * 100}% of the sewing and fabric price.`}
      </p>
      {payouts.length === 0 ? (
        <p className="card text-stone-600">No earnings yet. They appear here when your first order is completed.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr><th className="p-3">Date</th><th className="p-3">Order</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-stone-100">
                  <td className="p-3">{p.createdAt.toLocaleDateString("en-GH")}</td>
                  <td className="p-3">
                    {p.order.kind === "SEW" ? p.order.style?.name : `${p.order.yards} yd ${p.order.material?.name}`}
                    <span className="text-stone-500"> · {p.order.client.name}</span>
                  </td>
                  <td className="p-3 font-semibold">{formatCedis(p.amount)}</td>
                  <td className="p-3">
                    {p.status === "PAID"
                      ? <span className="badge bg-brand-100 text-brand-700">Paid · {p.reference}</span>
                      : <span className="badge bg-gold-100 text-gold-500">Pending</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`card ${highlight ? "border-brand-500" : ""}`}>
      <p className="text-sm text-stone-500">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
