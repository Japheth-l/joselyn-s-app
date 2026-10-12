import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CITIES, SEARCH_RADIUS_KM } from "@/lib/constants";
import { distanceKm, formatCedis } from "@/lib/geo";
import { measurerClaim, measurerSubmit } from "@/app/actions/orders";
import { AgentVerificationBanner } from "@/components/agent-banner";
import { MeasurementForm, MeasurementList } from "@/components/measurements";
import { JobMap } from "@/components/job-map";

export default async function MeasurerPage() {
  const user = await requireUser("MEASURER");
  const here = user.lat != null && user.lng != null ? { lat: user.lat, lng: user.lng } : CITIES.Accra;
  const verified = user.verificationStatus === "VERIFIED";

  const [open, mine] = await Promise.all([
    db.order.findMany({
      where: { status: "AWAITING_MEASUREMENT", measurementMethod: "HOME_VISIT", measurerId: null, paymentStatus: "PAID" },
      include: { style: true, business: true },
      orderBy: { measurementTime: "asc" },
    }),
    db.order.findMany({
      where: { measurerId: user.id },
      include: { style: true, business: true, client: true },
      orderBy: { measurementTime: "desc" },
    }),
  ]);
  const nearby = open
    .map((o) => ({ ...o, km: distanceKm(here.lat, here.lng, o.clientLat ?? 0, o.clientLng ?? 0) }))
    .filter((o) => o.km <= SEARCH_RADIUS_KM)
    .sort((a, b) => a.km - b.km);
  const active = mine.filter((o) => o.status === "AWAITING_MEASUREMENT");
  const done = mine.filter((o) => o.status !== "AWAITING_MEASUREMENT");

  return (
    <div className="space-y-8">
      <h1 className="page-title">Measurement jobs</h1>
      <AgentVerificationBanner status={user.verificationStatus} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">My visits ({active.length})</h2>
        {active.length === 0 && <p className="card text-stone-600">No visits scheduled. Pick a job below.</p>}
        <div className="space-y-4">
          {active.map((o) => (
            <div key={o.id} className="card grid gap-4 md:grid-cols-2">
              <div className="space-y-2 text-sm">
                <p className="text-base font-semibold">{o.style?.icon} {o.style?.name} for {o.client.name}</p>
                <p>🕒 {o.measurementTime?.toLocaleString("en-GH")}</p>
                <p>📍 {o.clientAddress}</p>
                <p>📞 <a className="text-brand-700 underline" href={`tel:${o.client.phone}`}>{o.client.phone}</a></p>
                <p>Send to: <strong>{o.business.name}</strong>, {o.business.address}</p>
                {o.ownFabric && <p className="rounded bg-gold-100 p-2">🧺 Client has their own fabric. Collect it and take it to the tailor.</p>}
                {o.notes && <p className="text-stone-500">📝 {o.notes}</p>}
                <a className="btn-secondary" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${o.clientLat},${o.clientLng}`}>Directions</a>
              </div>
              <div className="space-y-3">
                <JobMap pins={[{ id: "client", lat: o.clientLat!, lng: o.clientLng!, label: o.client.name, emoji: "🏠" }]} />
                <MeasurementForm action={measurerSubmit.bind(null, o.id)} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Jobs near you ({nearby.length})</h2>
        {nearby.length === 0 && <p className="card text-stone-600">No open jobs within {SEARCH_RADIUS_KM} km right now.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {nearby.map((o) => (
            <li key={o.id} className="card space-y-2 text-sm">
              <p className="font-semibold">{o.style?.icon} {o.style?.name}</p>
              <p>🕒 {o.measurementTime?.toLocaleString("en-GH")}</p>
              <p>📍 About {o.km.toFixed(1)} km from you · tailor: {o.business.name}</p>
              <p>You earn: <strong>{formatCedis(o.measurementFee)}</strong></p>
              <form action={measurerClaim.bind(null, o.id)}>
                <button className="btn-primary" disabled={!verified}>Take this job</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Completed ({done.length})</h2>
          <ul className="space-y-2">
            {done.map((o) => (
              <li key={o.id} className="card space-y-2 text-sm">
                <p className="font-semibold">{o.style?.name} for {o.client.name} → {o.business.name}</p>
                <MeasurementList json={o.measurements} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
