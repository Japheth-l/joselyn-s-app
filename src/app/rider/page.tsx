import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CITIES, SEARCH_RADIUS_KM } from "@/lib/constants";
import { distanceKm, formatCedis } from "@/lib/geo";
import { riderClaim, riderDelivered } from "@/app/actions/orders";
import { AgentVerificationBanner } from "@/components/agent-banner";
import { JobMap } from "@/components/job-map";

export default async function RiderPage() {
  const user = await requireUser("RIDER");
  const here = user.lat != null && user.lng != null ? { lat: user.lat, lng: user.lng } : CITIES.Accra;
  const verified = user.verificationStatus === "VERIFIED";

  const [open, mine] = await Promise.all([
    db.order.findMany({
      where: { status: "READY", fulfilment: "DELIVERY", riderId: null, paymentStatus: "PAID" },
      include: { style: true, material: true, business: true },
      orderBy: { updatedAt: "asc" },
    }),
    db.order.findMany({
      where: { riderId: user.id },
      include: { style: true, material: true, business: true, client: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  const nearby = open
    .map((o) => ({
      ...o,
      toShopKm: distanceKm(here.lat, here.lng, o.business.lat, o.business.lng),
      tripKm: distanceKm(o.business.lat, o.business.lng, o.clientLat ?? 0, o.clientLng ?? 0),
    }))
    .filter((o) => o.toShopKm <= SEARCH_RADIUS_KM)
    .sort((a, b) => a.toShopKm - b.toShopKm);
  const active = mine.filter((o) => o.status === "OUT_FOR_DELIVERY");
  const done = mine.filter((o) => o.status === "COMPLETED");
  const item = (o: (typeof open)[number]) => (o.kind === "SEW" ? `${o.style?.icon} ${o.style?.name}` : `🧶 ${o.yards} yd ${o.material?.name}`);

  return (
    <div className="space-y-8">
      <h1 className="page-title">Deliveries</h1>
      <AgentVerificationBanner status={user.verificationStatus} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">On the way ({active.length})</h2>
        {active.length === 0 && <p className="card text-stone-600">Nothing to deliver right now. Pick a delivery below.</p>}
        <div className="space-y-4">
          {active.map((o) => (
            <div key={o.id} className="card grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p className="text-base font-semibold">{item(o)}</p>
                <p>1️⃣ Pick up: <strong>{o.business.name}</strong>, {o.business.address}, {o.business.city} · 📞 {o.business.phone}</p>
                <p>2️⃣ Deliver to: <strong>{o.client.name}</strong>, {o.clientAddress} · 📞{" "}
                  <a className="text-brand-700 underline" href={`tel:${o.client.phone}`}>{o.client.phone}</a>
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <a className="btn-secondary" target="_blank" rel="noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&origin=${o.business.lat},${o.business.lng}&destination=${o.clientLat},${o.clientLng}`}>Directions</a>
                  <form action={riderDelivered.bind(null, o.id)}><button className="btn-primary">Mark as delivered</button></form>
                </div>
              </div>
              <JobMap pins={[
                { id: "shop", lat: o.business.lat, lng: o.business.lng, label: `Pick up: ${o.business.name}`, emoji: "🧵" },
                { id: "client", lat: o.clientLat!, lng: o.clientLng!, label: `Deliver: ${o.client.name}`, emoji: "🏠" },
              ]} />
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Deliveries near you ({nearby.length})</h2>
        {nearby.length === 0 && <p className="card text-stone-600">No deliveries waiting within {SEARCH_RADIUS_KM} km.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {nearby.map((o) => (
            <li key={o.id} className="card space-y-2 text-sm">
              <p className="font-semibold">{item(o)}</p>
              <p>Pick up at {o.business.name}, {o.business.address} ({o.toShopKm.toFixed(1)} km from you)</p>
              <p>Trip: about {o.tripKm.toFixed(1)} km · You earn <strong>{formatCedis(o.deliveryFee)}</strong></p>
              <form action={riderClaim.bind(null, o.id)}>
                <button className="btn-primary" disabled={!verified}>I&apos;ve picked it up</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Delivered ({done.length})</h2>
          <ul className="space-y-2 text-sm">
            {done.map((o) => (
              <li key={o.id} className="card flex justify-between">
                <span>{item(o)} → {o.client.name}</span>
                <span>{formatCedis(o.deliveryFee)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
