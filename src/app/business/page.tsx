import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCedis } from "@/lib/geo";
import {
  businessAccept, businessDecline, businessMarkCollected, businessMarkReady, businessRecordMeasurements, businessStartSewing,
} from "@/app/actions/orders";
import { StatusBadge } from "@/components/order-status";
import { MeasurementForm, MeasurementList } from "@/components/measurements";

const GROUPS = [
  { title: "New orders", statuses: ["PLACED"] },
  { title: "In progress", statuses: ["AWAITING_MEASUREMENT", "MEASURED", "SEWING", "READY", "OUT_FOR_DELIVERY"] },
  { title: "Finished", statuses: ["COMPLETED", "DECLINED", "CANCELLED"] },
];

export default async function BusinessOrders() {
  const user = await requireUser("BUSINESS");
  const b = user.business!;
  const orders = await db.order.findMany({
    where: { businessId: b.id },
    include: { client: true, style: true, material: true, measurer: true, rider: true },
    orderBy: { createdAt: "desc" },
  });
  const verified = b.verificationStatus === "VERIFIED";

  if (orders.length === 0) {
    return <p className="card text-stone-600">No orders yet. Make sure your styles, prices and fabric stock are up to date so clients can find you.</p>;
  }

  return (
    <div className="space-y-8">
      {GROUPS.map((g) => {
        const list = orders.filter((o) => g.statuses.includes(o.status));
        if (!list.length) return null;
        return (
          <section key={g.title}>
            <h2 className="mb-3 text-lg font-semibold">{g.title} <span className="text-stone-400">({list.length})</span></h2>
            <ul className="space-y-3">
              {list.map((o) => (
                <li key={o.id} className="card space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {o.kind === "SEW" ? `${o.style?.icon} ${o.style?.name}` : `🧶 ${o.yards} yards of ${o.material?.name}`}
                      </p>
                      <p className="text-sm text-stone-500">
                        {o.client.name} · 📞 {o.client.phone} · ordered {o.createdAt.toLocaleDateString("en-GH")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{formatCedis(o.laborPrice + o.materialPrice)}</p>
                      <p className="text-xs text-stone-500">your share</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <StatusBadge status={o.status} />
                    {!["PLACED", "DECLINED", "CANCELLED"].includes(o.status) && (
                      <span className={`badge ${o.paymentStatus === "PAID" ? "bg-brand-100 text-brand-700" : "bg-gold-100 text-gold-500"}`}>
                        {o.paymentStatus === "PAID" ? "✓ Paid" : "Awaiting payment"}
                      </span>
                    )}
                    {o.kind === "SEW" && (
                      <span>Fabric: {o.material ? `${o.material.name} (${o.yards} yd)` : "client brings own"}</span>
                    )}
                    {o.kind === "SEW" && (
                      <span>Measurement: {o.measurementMethod === "SELF" ? "client entered" : o.measurementMethod === "AT_SHOP" ? "at your shop" : `home visit${o.measurer ? ` by ${o.measurer.name}` : ""}`}</span>
                    )}
                    <span>{o.fulfilment === "DELIVERY" ? `Delivery${o.rider ? ` by ${o.rider.name}` : ""}` : "Client picks up"}</span>
                  </div>
                  {o.notes && <p className="rounded-lg bg-stone-50 p-2 text-sm">📝 {o.notes}</p>}
                  <MeasurementList json={o.measurements} />

                  {verified && o.paymentStatus !== "PAID" && !["PLACED", "DECLINED", "CANCELLED"].includes(o.status) && (
                    <p className="text-sm text-stone-500">Waiting for the client to pay before work continues. They&apos;ve been notified.</p>
                  )}
                  {verified && (o.paymentStatus === "PAID" || o.status === "PLACED") && (
                    <div className="flex flex-wrap gap-2">
                      {o.status === "PLACED" && (
                        <>
                          <form action={businessAccept.bind(null, o.id)}><button className="btn-primary">Accept order</button></form>
                          <form action={businessDecline.bind(null, o.id)}><button className="btn-danger">Decline</button></form>
                        </>
                      )}
                      {o.status === "AWAITING_MEASUREMENT" && o.measurementMethod === "AT_SHOP" && (
                        <div className="w-full">
                          <p className="mb-2 text-sm font-medium">Record measurements when the client visits:</p>
                          <MeasurementForm action={businessRecordMeasurements.bind(null, o.id)} submitLabel="Save measurements" />
                        </div>
                      )}
                      {o.status === "AWAITING_MEASUREMENT" && o.measurementMethod === "HOME_VISIT" && (
                        <p className="text-sm text-stone-500">Waiting for a measurement agent to visit the client.</p>
                      )}
                      {o.status === "MEASURED" && (
                        <form action={businessStartSewing.bind(null, o.id)}><button className="btn-primary">Start sewing</button></form>
                      )}
                      {o.status === "SEWING" && (
                        <form action={businessMarkReady.bind(null, o.id)}><button className="btn-primary">Mark as ready</button></form>
                      )}
                      {o.status === "READY" && o.fulfilment === "PICKUP" && (
                        <form action={businessMarkCollected.bind(null, o.id)}><button className="btn-primary">Client has collected</button></form>
                      )}
                      {o.status === "READY" && o.fulfilment === "DELIVERY" && (
                        <p className="text-sm text-stone-500">Waiting for a rider to pick up.</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
