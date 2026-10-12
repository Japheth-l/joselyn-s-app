import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MEASUREMENT_FIELDS } from "@/lib/constants";
import { formatCedis } from "@/lib/geo";
import { clientCancel, payForOrder, submitReview } from "@/app/actions/orders";
import { paymentsLive } from "@/lib/payments";
import { ReviewForm } from "./review-form";
import { StatusBadge, Timeline } from "@/components/order-status";
import { Swatch } from "@/components/swatch";

export default async function OrderDetail({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; paid?: string }>;
}) {
  const user = await requireUser("CLIENT");
  const { id } = await params;
  const { placed, paid } = await searchParams;
  const o = await db.order.findFirst({
    where: { id, clientId: user.id },
    include: { style: true, material: true, business: true, measurer: true, rider: true, review: true },
  });
  if (!o) notFound();
  const measurements: Record<string, number> = o.measurements ? JSON.parse(o.measurements) : {};
  const needsPayment = o.paymentStatus === "UNPAID" && !["PLACED", "DECLINED", "CANCELLED"].includes(o.status);

  return (
    <div className="space-y-6">
      {placed && (
        <div className="rounded-xl bg-brand-50 p-4 text-brand-700">
          🎉 Your order has been sent to <strong>{o.business.name}</strong>. We&apos;ll update you here as it moves along.
        </div>
      )}
      {paid && o.paymentStatus === "PAID" && (
        <div className="rounded-xl bg-brand-50 p-4 text-brand-700">✅ Payment received. Thank you!</div>
      )}
      {needsPayment && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-gold-400 bg-gold-100 p-4">
          <div>
            <p className="font-semibold">{o.business.name} accepted your order. Please pay to continue.</p>
            <p className="text-sm text-stone-700">
              Pay {formatCedis(o.total)} with MTN MoMo, Telecel Cash, AirtelTigo Money or card.
              {!paymentsLive() && " (Demo mode: no real money moves.)"}
            </p>
          </div>
          <form action={payForOrder.bind(null, o.id)}>
            <button className="btn-primary px-6">Pay {formatCedis(o.total)}</button>
          </form>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{o.kind === "SEW" ? `${o.style?.icon} ${o.style?.name}` : `🧶 Fabric order`}</h1>
        <StatusBadge status={o.status} />
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="card space-y-3 text-sm">
            <h2 className="font-semibold">Details</h2>
            <p><span className="text-stone-500">Tailor:</span> {o.business.name}, {o.business.address}, {o.business.city} · 📞 {o.business.phone}</p>
            <div className="flex items-center gap-3">
              {o.material && <Swatch design={o.material.design} color={o.material.color} imageUrl={o.material.imageUrl} className="h-10 w-10" />}
              <p><span className="text-stone-500">Fabric:</span> {o.material ? `${o.material.name} (${o.yards} yards)` : "Client's own fabric"}</p>
            </div>
            {o.kind === "SEW" && (
              <p><span className="text-stone-500">Measurements:</span>{" "}
                {o.measurementMethod === "SELF" ? "Entered by you"
                  : o.measurementMethod === "AT_SHOP" ? "At the tailor's shop"
                  : `Home visit${o.measurementTime ? ` on ${o.measurementTime.toLocaleString("en-GH")}` : ""}${o.measurer ? ` by ${o.measurer.name} (📞 ${o.measurer.phone})` : " (agent not yet assigned)"}`}
              </p>
            )}
            <p><span className="text-stone-500">Collection:</span>{" "}
              {o.fulfilment === "DELIVERY" ? `Delivery to ${o.clientAddress}${o.rider ? ` by ${o.rider.name} (📞 ${o.rider.phone})` : ""}` : "You'll pick it up"}
            </p>
            {o.notes && <p><span className="text-stone-500">Notes:</span> {o.notes}</p>}
          </div>

          {Object.keys(measurements).length > 0 && (
            <div className="card text-sm">
              <h2 className="mb-2 font-semibold">Your measurements (inches)</h2>
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MEASUREMENT_FIELDS.filter((f) => measurements[f.key]).map((f) => (
                  <div key={f.key}><dt className="text-stone-500">{f.label}</dt><dd className="font-medium">{measurements[f.key]}</dd></div>
                ))}
              </dl>
            </div>
          )}

          <div className="card space-y-1 text-sm">
            <h2 className="mb-2 font-semibold">Price</h2>
            {o.laborPrice > 0 && <Line label="Sewing" value={o.laborPrice} />}
            {o.materialPrice > 0 && <Line label="Fabric" value={o.materialPrice} />}
            {o.measurementFee > 0 && <Line label="Measurement visit" value={o.measurementFee} />}
            {o.deliveryFee > 0 && <Line label="Delivery" value={o.deliveryFee} />}
            <div className="flex justify-between border-t border-stone-200 pt-2 font-bold"><span>Total</span><span>{formatCedis(o.total)}</span></div>
            <p className={`pt-1 text-xs font-semibold ${o.paymentStatus === "PAID" ? "text-brand-700" : "text-stone-500"}`}>
              {o.paymentStatus === "PAID"
                ? `✓ Paid${o.paidAt ? ` on ${o.paidAt.toLocaleDateString("en-GH")}` : ""}`
                : o.status === "PLACED" ? "You'll pay once the tailor accepts." : "Not paid yet"}
            </p>
          </div>

          {o.status === "COMPLETED" && o.kind === "SEW" && (
            o.review ? (
              <div className="card text-sm">
                <h2 className="mb-1 font-semibold">Your review</h2>
                <p className="text-lg text-gold-500">{"★".repeat(o.review.rating)}<span className="text-stone-300">{"★".repeat(5 - o.review.rating)}</span></p>
                {o.review.comment && <p className="mt-1">{o.review.comment}</p>}
              </div>
            ) : (
              <ReviewForm action={submitReview.bind(null, o.id)} businessName={o.business.name} />
            )
          )}

          {o.status === "PLACED" && (
            <form action={clientCancel.bind(null, o.id)}>
              <button className="btn-danger">Cancel order</button>
            </form>
          )}
        </div>

        <aside className="card self-start">
          <h2 className="mb-4 font-semibold">Progress</h2>
          <Timeline order={o} />
        </aside>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between"><span className="text-stone-500">{label}</span><span>{formatCedis(value)}</span></div>;
}
