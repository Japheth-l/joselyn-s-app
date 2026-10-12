"use client";

import { useMemo, useState, useTransition } from "react";
import type { Style } from "@prisma/client";
import { getRecommendations, placeSewOrder } from "@/app/actions/orders";
import { TailorMap } from "@/components/map";
import { StyleImage, Swatch } from "@/components/swatch";
import { useLiveLocation, type LatLng } from "@/components/use-location";
import { BUSINESS_KINDS, CITIES, FABRIC_DESIGNS, FEES, MEASUREMENT_FIELDS } from "@/lib/constants";
import { deliveryFee, distanceKm, formatCedis } from "@/lib/geo";
import type { Recommendation } from "@/lib/recommend";

const STEPS = ["Style", "Fabric", "Budget", "Tailor", "Measurements", "Delivery", "Confirm"];
const DESIGN_COLORS: Record<string, string> = {
  KENTE: "#b45309", WAX_PRINT: "#1d4ed8", LACE: "#d6b98c", BATIK: "#1e3a8a", SMOCK_CLOTH: "#1e40af", PLAIN: "#a8a29e",
};

type MeasureMethod = "SELF" | "HOME_VISIT" | "AT_SHOP";

export function OrderWizard({ styles, home }: { styles: Style[]; home: LatLng }) {
  const [step, setStep] = useState(0);
  const [style, setStyle] = useState<Style | null>(null);
  const [design, setDesign] = useState<string | null>(null);
  const [budget, setBudget] = useState("");
  const [city, setCity] = useState<string>("");
  const live = useLiveLocation();
  const [recs, setRecs] = useState<{ results: Recommendation[]; widened: boolean } | null>(null);
  const [tailor, setTailor] = useState<Recommendation | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [knowsMeasurements, setKnowsMeasurements] = useState<boolean | null>(null);
  const [method, setMethod] = useState<MeasureMethod | null>(null);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [visitTime, setVisitTime] = useState("");
  const [fulfilment, setFulfilment] = useState<"DELIVERY" | "PICKUP" | null>(null);
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const searchCenter: LatLng = live.location ?? (city ? CITIES[city] : home);
  const material = tailor?.materials.find((m) => m.id === materialId) ?? null;
  const needsLocation = method === "HOME_VISIT" || fulfilment === "DELIVERY";

  const prices = useMemo(() => {
    if (!tailor || !style) return null;
    const fabric = material ? Math.round(material.pricePerYard * style.yardsNeeded) : 0;
    const measure = method === "HOME_VISIT" ? FEES.homeMeasurement : 0;
    const delivery = fulfilment === "DELIVERY"
      ? deliveryFee(distanceKm(tailor.lat, tailor.lng, searchCenter.lat, searchCenter.lng))
      : 0;
    return { labour: tailor.laborPrice, fabric, measure, delivery, total: tailor.laborPrice + fabric + measure + delivery };
  }, [tailor, style, material, method, fulfilment, searchCenter.lat, searchCenter.lng]);

  function go(n: number) {
    setError(null);
    setStep(n);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function findTailors() {
    const b = Number(budget);
    if (!style || !design || !(b > 0)) return setError("Enter your budget in cedis.");
    setError(null);
    startTransition(async () => {
      const r = await getRecommendations({ styleId: style.id, design, budget: b, ...searchCenter });
      setRecs(r);
      setTailor(null);
      setMaterialId(null);
      go(3);
    });
  }

  function submit() {
    if (!style || !tailor || !method || !fulfilment) return;
    const m: Record<string, number> = {};
    for (const [k, v] of Object.entries(measurements)) if (Number(v) > 0) m[k] = Number(v);
    setError(null);
    startTransition(async () => {
      const res = await placeSewOrder({
        styleId: style.id, businessId: tailor.businessId, materialId, budget: Number(budget), notes,
        measurementMethod: method,
        measurements: method === "SELF" ? m : undefined,
        measurementTime: method === "HOME_VISIT" && visitTime ? new Date(visitTime).toISOString() : undefined,
        fulfilment, location: needsLocation ? searchCenter : null, address,
      });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2 text-xs font-semibold">
        {STEPS.map((s, i) => (
          <li key={s} className={`rounded-full px-3 py-1 ${i === step ? "bg-brand-600 text-white" : i < step ? "bg-brand-100 text-brand-700" : "bg-stone-200 text-stone-500"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Section title="Which style would you like?">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {styles.map((s) => (
              <button
                key={s.id}
                onClick={() => { setStyle(s); go(1); }}
                className={`card flex gap-4 text-left transition hover:border-brand-500 ${style?.id === s.id ? "border-brand-500 ring-2 ring-brand-100" : ""}`}
              >
                <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="h-20 w-20 shrink-0" />
                <span>
                  <span className="block font-semibold">{s.name}</span>
                  <span className="block text-sm text-stone-600">{s.description}</span>
                  <span className="mt-1 block text-xs text-stone-400">{s.wearer.toLowerCase()} · about {s.yardsNeeded} yards</span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {step === 1 && (
        <Section title="Choose your fabric design" back={() => go(0)}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(FABRIC_DESIGNS).map(([key, d]) => (
              <button key={key} onClick={() => { setDesign(key); go(2); }} className={`card text-left hover:border-brand-500 ${design === key ? "border-brand-500" : ""}`}>
                <Swatch design={key} color={DESIGN_COLORS[key]} className="mb-3 h-20" />
                <span className="block font-semibold">{d.label}</span>
                <span className="text-sm text-stone-600">{d.blurb}</span>
              </button>
            ))}
            <button onClick={() => { setDesign("OWN"); go(2); }} className={`card text-left hover:border-brand-500 ${design === "OWN" ? "border-brand-500" : ""}`}>
              <div className="mb-3 grid h-20 place-items-center rounded-lg border border-dashed border-stone-300 text-3xl">🧺</div>
              <span className="block font-semibold">I have my own fabric</span>
              <span className="text-sm text-stone-600">You&apos;ll hand your cloth to the tailor or measurement agent.</span>
            </button>
          </div>
        </Section>
      )}

      {step === 2 && (
        <Section title="What's your budget, and where are you?" back={() => go(1)}>
          <div className="card max-w-xl space-y-5">
            <div>
              <label className="label" htmlFor="budget">Your budget for {style?.name} (GH₵)</label>
              <input id="budget" className="input" type="number" min={1} inputMode="numeric" placeholder="e.g. 500" value={budget} onChange={(e) => setBudget(e.target.value)} />
              <p className="mt-1 text-xs text-stone-500">Covers sewing{design !== "OWN" ? " and fabric" : ""}. Measurement visits and delivery are extra and optional.</p>
            </div>
            <div className="space-y-2">
              <span className="label">Find tailors near</span>
              <button type="button" className="btn-secondary w-full" onClick={live.request} disabled={live.status === "locating"}>
                📍 {live.status === "locating" ? "Getting your location…" : live.location ? "Using your live location ✓" : "Use my current location"}
              </button>
              {live.error && <p className="text-sm text-red-700">{live.error}</p>}
              {!live.location && (
                <select className="input" value={city} onChange={(e) => setCity(e.target.value)} aria-label="Or choose a city">
                  <option value="">…or choose a city (default: your account city)</option>
                  {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
                </select>
              )}
            </div>
            <button className="btn-primary w-full" onClick={findTailors} disabled={pending}>
              {pending ? "Finding tailors…" : "Find tailors near me"}
            </button>
          </div>
        </Section>
      )}

      {step === 3 && recs && (
        <Section title="Recommended tailors" back={() => go(2)}>
          {recs.results.length === 0 ? (
            <div className="card">
              No verified tailors offer this style with that fabric yet. Try another fabric design, or choose &quot;I have my own fabric&quot;.
            </div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
              <div className="order-2 space-y-3 lg:order-1">
                {recs.widened && (
                  <p className="rounded-lg bg-gold-100 p-3 text-sm">No tailors within 25 km offer this yet, so here are the closest ones.</p>
                )}
                {recs.results.map((r) => (
                  <div key={r.businessId} className={`card ${tailor?.businessId === r.businessId ? "border-brand-500 ring-2 ring-brand-100" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{r.name} <span className="badge bg-brand-50 text-brand-700">✓ Verified</span></h3>
                        <p className="text-sm text-stone-600">
                          {BUSINESS_KINDS[r.kind as keyof typeof BUSINESS_KINDS]} · {r.address}, {r.city} · {r.distanceKm} km away
                          {r.reviewCount > 0 && <> · ⭐ {r.rating.toFixed(1)} ({r.reviewCount})</>}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{formatCedis(r.estimate)}</div>
                        <div className={`text-xs font-semibold ${r.withinBudget ? "text-brand-700" : "text-clay-500"}`}>
                          {r.withinBudget ? "Within budget" : "Over budget"}
                        </div>
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-stone-500">
                      Sewing {formatCedis(r.laborPrice)}{design !== "OWN" && <> + fabric from {formatCedis(r.fabricPrice)}</>} · ready in about {r.daysToMake} days
                    </p>
                    {tailor?.businessId === r.businessId && design !== "OWN" && (
                      <div className="mt-4">
                        <p className="label">Pick the fabric</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {r.materials.map((m) => (
                            <button
                              key={m.id}
                              onClick={() => setMaterialId(m.id)}
                              className={`flex items-center gap-3 rounded-lg border p-2 text-left text-sm ${materialId === m.id ? "border-brand-500 bg-brand-50" : "border-stone-200"}`}
                            >
                              <Swatch design={m.design} color={m.color} imageUrl={m.imageUrl} className="h-10 w-10 shrink-0" />
                              <span>
                                <span className="block font-medium">{m.name}</span>
                                <span className="text-stone-500">{formatCedis(m.pricePerYard)}/yard · {formatCedis(m.pricePerYard * (style?.yardsNeeded ?? 0))} total</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {tailor?.businessId !== r.businessId ? (
                        <button className="btn-secondary" onClick={() => { setTailor(r); setMaterialId(null); }}>Choose this tailor</button>
                      ) : null}
                      {tailor?.businessId !== r.businessId ? (
                        <a href={`/tailors/${r.businessId}`} target="_blank" rel="noreferrer" className="text-sm font-medium text-brand-700 hover:underline">
                          See photos & reviews ↗
                        </a>
                      ) : (
                        <button className="btn-primary" disabled={design !== "OWN" && !materialId} onClick={() => go(4)}>
                          Continue
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="order-1 lg:sticky lg:top-4 lg:order-2 lg:self-start">
                <TailorMap
                  center={searchCenter}
                  you={searchCenter}
                  selectedId={tailor?.businessId}
                  onSelect={(id) => { const r = recs.results.find((x) => x.businessId === id); if (r) { setTailor(r); setMaterialId(null); } }}
                  pins={recs.results.map((r) => ({ id: r.businessId, lat: r.lat, lng: r.lng, label: r.name, sub: `${formatCedis(r.estimate)} · ${r.distanceKm} km`, emoji: "🧵" }))}
                />
              </div>
            </div>
          )}
        </Section>
      )}

      {step === 4 && tailor && (
        <Section title="Measurements" back={() => go(3)}>
          <div className="card max-w-2xl space-y-5">
            <Question
              q="Do you know your measurements?"
              options={[{ v: true, label: "Yes, I'll enter them" }, { v: false, label: "No" }]}
              value={knowsMeasurements}
              onChange={(v) => { setKnowsMeasurements(v); setMethod(v ? "SELF" : null); }}
            />

            {knowsMeasurements === false && (
              <Question
                q={`Would you like a measurement agent to come to you? (${formatCedis(FEES.homeMeasurement)})`}
                options={[
                  { v: "HOME_VISIT" as const, label: "Yes, come to me" },
                  { v: "AT_SHOP" as const, label: `No, I'll go to ${tailor.name}` },
                ]}
                value={method === "SELF" ? null : method}
                onChange={setMethod}
              />
            )}

            {method === "SELF" && (
              <div>
                <p className="mb-2 text-sm text-stone-600">In inches. Fill in at least three; your tailor will contact you if anything is missing.</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {MEASUREMENT_FIELDS.map((f) => (
                    <div key={f.key}>
                      <label className="label text-xs" htmlFor={f.key}>{f.label}</label>
                      <input id={f.key} className="input" type="number" min={1} max={120} step={0.5} inputMode="decimal"
                        value={measurements[f.key] ?? ""} onChange={(e) => setMeasurements({ ...measurements, [f.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {method === "HOME_VISIT" && (
              <div className="space-y-4">
                <div>
                  <label className="label" htmlFor="visit">When are you available to be measured?</label>
                  <input id="visit" className="input" type="datetime-local" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
                </div>
                <LocationFields live={live} address={address} setAddress={setAddress} reason="so the agent can find you" />
              </div>
            )}

            {method === "AT_SHOP" && (
              <p className="rounded-lg bg-stone-50 p-3 text-sm">
                Visit <strong>{tailor.name}</strong> at {tailor.address}, {tailor.city} once they accept your order.
              </p>
            )}

            <button
              className="btn-primary"
              disabled={!method || (method === "HOME_VISIT" && (!visitTime || !address))}
              onClick={() => go(5)}
            >
              Continue
            </button>
          </div>
        </Section>
      )}

      {step === 5 && tailor && (
        <Section title="Getting your outfit" back={() => go(4)}>
          <div className="card max-w-2xl space-y-5">
            <Question
              q="Would you like your finished outfit delivered?"
              options={[
                { v: "DELIVERY" as const, label: "Yes, deliver to me" },
                { v: "PICKUP" as const, label: "No, I'll pick it up myself" },
              ]}
              value={fulfilment}
              onChange={setFulfilment}
            />
            {fulfilment === "DELIVERY" && (
              <>
                <LocationFields live={live} address={address} setAddress={setAddress} reason="for the delivery rider" />
                {prices && <p className="text-sm text-stone-600">Delivery fee: <strong>{formatCedis(prices.delivery)}</strong></p>}
              </>
            )}
            {fulfilment === "PICKUP" && (
              <p className="text-sm text-stone-600">Pick up from {tailor.address}, {tailor.city}. We&apos;ll let you know when it&apos;s ready.</p>
            )}
            <div>
              <label className="label" htmlFor="notes">Anything else for your tailor? (optional)</label>
              <textarea id="notes" className="input" rows={3} placeholder="e.g. puff sleeves, add a zip at the back" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <button className="btn-primary" disabled={!fulfilment || (fulfilment === "DELIVERY" && !address)} onClick={() => go(6)}>
              Review order
            </button>
          </div>
        </Section>
      )}

      {step === 6 && tailor && style && prices && (
        <Section title="Confirm your order" back={() => go(5)}>
          <div className="card max-w-2xl space-y-4">
            <Row label="Style" value={`${style.icon} ${style.name}`} />
            <Row label="Fabric" value={material ? material.name : "My own fabric"} />
            <Row label="Tailor" value={`${tailor.name}, ${tailor.city}`} />
            <Row label="Measurements" value={
              method === "SELF" ? "I entered them" : method === "HOME_VISIT" ? `Agent visit on ${new Date(visitTime).toLocaleString("en-GH")}` : "At the tailor's shop"
            } />
            <Row label="Collection" value={fulfilment === "DELIVERY" ? `Delivery to ${address}` : "I'll pick it up"} />
            <hr className="border-stone-200" />
            <Row label="Sewing" value={formatCedis(prices.labour)} />
            {prices.fabric > 0 && <Row label={`Fabric (${style.yardsNeeded} yards)`} value={formatCedis(prices.fabric)} />}
            {prices.measure > 0 && <Row label="Measurement visit" value={formatCedis(prices.measure)} />}
            {prices.delivery > 0 && <Row label="Delivery" value={formatCedis(prices.delivery)} />}
            <Row label={<strong>Total</strong>} value={<strong>{formatCedis(prices.total)}</strong>} />
            {prices.total > Number(budget) && (
              <p className="text-sm text-clay-500">This is {formatCedis(prices.total - Number(budget))} over your budget of {formatCedis(Number(budget))}.</p>
            )}
            <p className="text-xs text-stone-500">Nothing to pay yet. Once the tailor accepts, you&apos;ll pay with MTN MoMo, Telecel Cash, AirtelTigo Money or card.</p>
            <button className="btn-primary w-full" onClick={submit} disabled={pending}>{pending ? "Placing order…" : "Place order"}</button>
          </div>
        </Section>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function Section({ title, back, children }: { title: string; back?: () => void; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        {back && <button onClick={back} className="text-sm font-medium text-stone-500 hover:text-stone-800">← Back</button>}
        <h2 className="text-xl font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Question<T>({ q, options, value, onChange }: { q: string; options: { v: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="label">{q}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button key={String(o.v)} type="button" onClick={() => onChange(o.v)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${value === o.v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-300"}`}>
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function LocationFields({ live, address, setAddress, reason }: {
  live: ReturnType<typeof useLiveLocation>; address: string; setAddress: (v: string) => void; reason: string;
}) {
  return (
    <div className="space-y-3 rounded-lg bg-stone-50 p-4">
      <p className="text-sm text-stone-600">Share your live location {reason}.</p>
      <button type="button" className="btn-secondary" onClick={live.request} disabled={live.status === "locating"}>
        📍 {live.status === "locating" ? "Getting location…" : live.location ? "Live location shared ✓" : "Share my live location"}
      </button>
      {live.error && <p className="text-sm text-red-700">{live.error}</p>}
      <div>
        <label className="label" htmlFor="address">Address or landmark</label>
        <input id="address" className="input" placeholder="e.g. House 12, behind Total filling station, Dansoman" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-stone-500">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}
