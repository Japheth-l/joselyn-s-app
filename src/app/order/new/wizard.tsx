"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { StyleImage } from "@/components/swatch";
import { useLiveLocation } from "@/components/use-location";
import { createCustomOrderAction } from "@/app/actions/orders";
import { findTailorsAction, type MatchView } from "@/app/actions/matching";

export type WizardStyle = {
  id: string; slug: string; name: string; icon: string; imageUrl: string | null; category: string;
  measurementKeys: string[]; options: { key: string; label: string; choices: string[] }[]; fabricYards: number; labourMinor: number | null;
};

type Props = {
  styles: WizardStyle[];
  saved: { id: string; label: string; keys: string[] }[];
  fields: Record<string, string>;
  fabricTypes: Record<string, string>;
  home: { lat: number; lng: number; city: string };
  initialStyleId?: string;
  preferredBusinessId?: string;
  measurementFee: string;
};

const STEPS = ["Style", "Details", "Fabric", "Measurements", "Budget & date", "Choose tailors", "Review"] as const;
const money = (minor: number | null) => (minor == null ? "Price on request" : `GH₵ ${(minor / 100).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const tomorrow = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

export function OrderWizard({ styles, saved, fields, fabricTypes, home, initialStyleId, preferredBusinessId, measurementFee }: Props) {
  const [step, setStep] = useState(initialStyleId ? 1 : 0);
  const [styleId, setStyleId] = useState(initialStyleId ?? "");
  const [query, setQuery] = useState("");
  const [fabricSource, setFabricSource] = useState<"OWN" | "BUSINESS" | "SELLER">("BUSINESS");
  const [fabricType, setFabricType] = useState("");
  const [method, setMethod] = useState<"SAVED" | "SELF" | "HOME_VISIT" | "AT_WORKSHOP">(saved.length ? "SAVED" : "SELF");
  const [budget, setBudget] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [radius, setRadius] = useState(25);
  const [match, setMatch] = useState<MatchView | null>(null);
  const [selected, setSelected] = useState<string[]>(preferredBusinessId ? [preferredBusinessId] : []);
  const [stepError, setStepError] = useState<string | null>(null);
  const [searching, startSearch] = useTransition();
  const loc = useLiveLocation();
  const style = styles.find((s) => s.id === styleId);
  const where = loc.location ?? { lat: home.lat, lng: home.lng };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? styles.filter((s) => `${s.name} ${s.category}`.toLowerCase().includes(q)) : styles;
  }, [styles, query]);

  const runSearch = () => {
    if (!style) return;
    startSearch(async () => {
      const r = await findTailorsAction({ styleId: style.id, lat: where.lat, lng: where.lng, budget: budget || undefined, neededBy: neededBy || undefined, fabricSource, fabricType: fabricType || undefined, measurementMethod: method, radiusKm: radius });
      setMatch(r);
      setSelected((prev) => prev.filter((id) => r.results.some((x) => x.businessId === id)));
    });
  };

  useEffect(() => {
    if (step === 5) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, loc.location, radius]);

  function next() {
    setStepError(null);
    if (step === 0 && !style) return setStepError("Choose a style first.");
    if (step === 3 && method === "SAVED" && saved.length === 0) return setStepError("You have no saved measurements yet. Choose another option.");
    if (step === 3 && method === "HOME_VISIT" && !loc.location) return setStepError("Share your location so the professional can find you.");
    if (step === 5 && selected.length === 0) return setStepError("Choose at least one tailor to ask for a quote.");
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const back = () => { setStepError(null); setStep((s) => Math.max(0, s - 1)); };
  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 5 ? prev : [...prev, id]));

  return (
    <ActionForm action={createCustomOrderAction} className="space-y-5">
      <ol className="flex gap-1 overflow-x-auto pb-1 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined}
            className={`shrink-0 rounded-full px-3 py-1 font-medium ${i === step ? "bg-brand-600 text-white" : i < step ? "bg-brand-100 text-brand-700" : "bg-stone-100 text-stone-500"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <input type="hidden" name="styleId" value={styleId} />

      {/* 1. Style */}
      <section hidden={step !== 0} className="card space-y-4">
        <h2 className="text-lg font-semibold">What would you like sewn?</h2>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search styles" aria-label="Search styles" className="input" />
        <ul className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
          {filtered.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => { setStyleId(s.id); setStepError(null); }}
                className={`flex w-full flex-col gap-1 rounded-xl border p-2 text-left ${styleId === s.id ? "border-brand-600 ring-2 ring-brand-100" : "border-stone-200 hover:border-brand-500"}`}>
                <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="aspect-[4/3] w-full text-3xl" />
                <span className="text-xs text-stone-500">{s.category}</span>
                <span className="text-sm font-semibold leading-snug">{s.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="text-xs text-stone-500">Can't find it? Choose the closest style and describe the differences, with photos, in the next step.</p>
      </section>

      {/* 2. Details */}
      <section hidden={step !== 1} className="card space-y-4">
        <h2 className="text-lg font-semibold">{style ? style.name : "Details"}</h2>
        {style?.options.map((o) => (
          <div key={o.key}>
            <label className="label" htmlFor={`opt_${o.key}`}>{o.label}</label>
            <select id={`opt_${o.key}`} name={`opt_${o.key}`} className="input" defaultValue="">
              <option value="">No preference</option>
              {o.choices.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        ))}
        <div>
          <label className="label" htmlFor="instructions">Anything else the tailor should know?</label>
          <textarea id="instructions" name="instructions" rows={4} maxLength={2000} className="input" placeholder="e.g. Slit at the back, lined bodice, matching head wrap" />
        </div>
        <div>
          <label className="label" htmlFor="reference">Reference photos (optional, up to 5)</label>
          <input id="reference" name="reference" type="file" multiple accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          <p className="mt-1 text-xs text-stone-500">Only the tailors you ask for a quote can see these.</p>
        </div>
      </section>

      {/* 3. Fabric */}
      <section hidden={step !== 2} className="card space-y-4">
        <h2 className="text-lg font-semibold">Fabric</h2>
        {style && <p className="text-sm text-stone-600">This style usually needs about {style.fabricYards} yards.</p>}
        <fieldset className="space-y-2">
          <legend className="sr-only">Where will the fabric come from?</legend>
          {([
            ["BUSINESS", "The tailor provides it", "Choose from their stock; it's included in their quote."],
            ["OWN", "I have my own fabric", "Bring it to the tailor, or send it with a rider."],
            ["SELLER", "I'll buy it from a fabric seller", "Order it on the Fabrics page after you choose a tailor, delivered straight to them."],
          ] as const).map(([v, label, help]) => (
            <label key={v} className={`flex gap-3 rounded-xl border p-3 ${fabricSource === v ? "border-brand-600 bg-brand-50" : "border-stone-200"}`}>
              <input type="radio" name="fabricSource" value={v} checked={fabricSource === v} onChange={() => setFabricSource(v)} className="mt-1" />
              <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-stone-600">{help}</span></span>
            </label>
          ))}
        </fieldset>
        {fabricSource === "BUSINESS" && (
          <div>
            <label className="label" htmlFor="fabricType">Preferred fabric (optional)</label>
            <select id="fabricType" value={fabricType} onChange={(e) => setFabricType(e.target.value)} className="input">
              <option value="">Any</option>
              {Object.entries(fabricTypes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        )}
      </section>

      {/* 4. Measurements */}
      <section hidden={step !== 3} className="card space-y-4">
        <h2 className="text-lg font-semibold">Measurements</h2>
        <fieldset className="space-y-2">
          <legend className="sr-only">How should we get your measurements?</legend>
          {([
            ["SAVED", "Use my saved measurements", saved.length ? "No visit needed." : "You don't have any saved yet."],
            ["SELF", "I'll enter my measurements", "Measure with a tape and type them in."],
            ["HOME_VISIT", "A professional comes to me", `A verified measurement professional visits you (fee ${measurementFee}, shown in the quote).`],
            ["AT_WORKSHOP", "I'll be measured at the workshop", "Visit the tailor you choose."],
          ] as const).map(([v, label, help]) => (
            <label key={v} className={`flex gap-3 rounded-xl border p-3 ${method === v ? "border-brand-600 bg-brand-50" : "border-stone-200"} ${v === "SAVED" && !saved.length ? "opacity-60" : ""}`}>
              <input type="radio" name="measurementMethod" value={v} checked={method === v} disabled={v === "SAVED" && !saved.length} onChange={() => setMethod(v)} className="mt-1" />
              <span><span className="block text-sm font-medium">{label}</span><span className="text-xs text-stone-600">{help}</span></span>
            </label>
          ))}
        </fieldset>
        {method === "SAVED" && saved.length > 0 && (
          <div>
            <label className="label" htmlFor="measurementRecordId">Which measurements?</label>
            <select id="measurementRecordId" name="measurementRecordId" className="input">
              {saved.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            {style && <p className="mt-1 text-xs text-stone-500">This style needs: {style.measurementKeys.map((k) => fields[k] ?? k).join(", ")}.</p>}
          </div>
        )}
        {method === "SELF" && style && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="label mb-0" htmlFor="unit">Unit</label>
              <select id="unit" name="unit" className="input w-auto"><option value="in">inches</option><option value="cm">cm</option></select>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {style.measurementKeys.map((k) => (
                <div key={k}>
                  <label className="label" htmlFor={`m_${k}`}>{fields[k] ?? k}</label>
                  <input id={`m_${k}`} name={`m_${k}`} inputMode="decimal" className="input" />
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-500">Measure over light clothing, keeping the tape snug but not tight. These are saved to your profile for next time.</p>
          </div>
        )}
        {method === "HOME_VISIT" && (
          <div className="space-y-3">
            <div>
              <label className="label" htmlFor="addressText">Address or landmark for the visit</label>
              <input id="addressText" name="addressText" className="input" placeholder="e.g. Blue gate opposite the Total station, Dansoman" />
            </div>
            <input type="hidden" name="lat" value={loc.location?.lat ?? ""} />
            <input type="hidden" name="lng" value={loc.location?.lng ?? ""} />
            <button type="button" onClick={loc.request} className="btn-secondary" disabled={loc.status === "locating"}>📍 {loc.status === "locating" ? "Finding you…" : loc.location ? "Location captured. Update it" : "Share my location"}</button>
            {loc.error && <p role="alert" className="text-sm text-red-700">{loc.error}</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="visitStart">Available from</label><input id="visitStart" name="visitStart" type="datetime-local" className="input" /></div>
              <div><label className="label" htmlFor="visitEnd">Until</label><input id="visitEnd" name="visitEnd" type="datetime-local" className="input" /></div>
            </div>
            <p className="text-xs text-stone-500">Your address and phone are shared only with the professional who accepts the visit. The visit is arranged after you pay the deposit.</p>
          </div>
        )}
      </section>

      {/* 5. Budget & date */}
      <section hidden={step !== 4} className="card space-y-4">
        <h2 className="text-lg font-semibold">Budget and date</h2>
        <div>
          <label className="label" htmlFor="budget">Your budget in cedis (optional)</label>
          <input id="budget" name="budget" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. 450" className="input" />
          <p className="mt-1 text-xs text-stone-500">Used to rank tailors. Tailors don't see it.</p>
        </div>
        <div>
          <label className="label" htmlFor="neededBy">When do you need it? (optional)</label>
          <input id="neededBy" name="neededBy" type="date" min={tomorrow()} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} className="input" />
        </div>
      </section>

      {/* 6. Choose tailors */}
      <section hidden={step !== 5} className="space-y-4">
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold">Choose who to ask for a quote</h2>
          <p className="text-sm text-stone-600">Searching near {loc.location ? "your current location" : home.city}. Choose up to 5.</p>
          <div className="flex flex-wrap items-center gap-2">
            {method !== "HOME_VISIT" && <button type="button" onClick={loc.request} className="btn-secondary" disabled={loc.status === "locating"}>📍 {loc.location ? "Update my location" : "Use my exact location"}</button>}
            <label className="flex items-center gap-2 text-sm">Within
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="input w-auto">
                {[5, 10, 25, 50, 100].map((r) => <option key={r} value={r}>{r} km</option>)}
              </select>
            </label>
          </div>
        </div>
        {searching && <p className="card text-sm text-stone-600">Finding tailors…</p>}
        {match?.error && <p role="alert" className="card text-sm text-red-700">{match.error}</p>}
        {!searching && match && !match.error && (
          <>
            {match.suggestions.length > 0 && (
              <div className="card space-y-1 border-gold-400 bg-gold-100/40 text-sm">
                {match.suggestions.map((s) => <p key={s}>💡 {s}</p>)}
              </div>
            )}
            {match.results.length === 0 ? (
              <p className="card text-sm text-stone-600">No verified tailor matches yet.</p>
            ) : (
              <ul className="space-y-3">
                {match.results.map((r) => {
                  const on = selected.includes(r.businessId);
                  return (
                    <li key={r.businessId}>
                      <label className={`card flex cursor-pointer gap-3 p-4 ${on ? "border-brand-600 ring-2 ring-brand-100" : ""}`}>
                        <input type="checkbox" name="businessIds" value={r.businessId} checked={on} onChange={() => toggle(r.businessId)} className="mt-1 h-5 w-5 shrink-0" />
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-semibold">{r.name} {r.isDemo && <span className="badge bg-sky-100 text-sky-800">Demo listing</span>}</span>
                            <span className="text-sm font-semibold">{r.estimateMinor != null ? `≈ ${money(r.estimateMinor)}` : "Price on request"}</span>
                          </span>
                          {r.withinBudget === false && <span className="badge bg-red-100 text-red-800">Over budget</span>}
                          <ul className="text-xs text-stone-600">{r.reasons.map((x) => <li key={x}>✓ {x}</li>)}{r.cautions.map((x) => <li key={x} className="text-amber-800">• {x}</li>)}</ul>
                          {r.estimateMinor != null && (
                            <span className="block text-[11px] text-stone-500">
                              Sewing {money(r.breakdown.labourMinor)}{r.breakdown.fabricMinor ? ` + fabric ${money(r.breakdown.fabricMinor)}` : ""}{r.breakdown.measurementMinor ? ` + visit ${money(r.breakdown.measurementMinor)}` : ""} + service fee {money(r.breakdown.serviceFeeMinor)}. The quote is final.
                            </span>
                          )}
                          {r.slug && <Link href={`/tailors/${r.slug}`} target="_blank" className="text-xs text-brand-700 underline">View profile</Link>}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {match.excluded.length > 0 && (
              <details className="card text-sm">
                <summary className="cursor-pointer font-medium">Why some tailors aren't shown ({match.excluded.length})</summary>
                <ul className="mt-2 space-y-1 text-stone-600">{match.excluded.map((e) => <li key={e.businessId}><strong>{e.name}</strong>: {e.reason}</li>)}</ul>
              </details>
            )}
          </>
        )}
      </section>

      {/* 7. Review */}
      <section hidden={step !== 6} className="card space-y-3 text-sm">
        <h2 className="text-lg font-semibold">Check and send</h2>
        <ul className="space-y-1">
          <li><strong>Style:</strong> {style?.name ?? "—"}</li>
          <li><strong>Fabric:</strong> {fabricSource === "BUSINESS" ? "from the tailor" : fabricSource === "OWN" ? "my own" : "from a fabric seller"}</li>
          <li><strong>Measurements:</strong> {{ SAVED: "saved measurements", SELF: "entered by me", HOME_VISIT: "home visit", AT_WORKSHOP: "at the workshop" }[method]}</li>
          <li><strong>Budget:</strong> {budget ? `GH₵ ${budget}` : "not set"} · <strong>Needed by:</strong> {neededBy || "no date"}</li>
          <li><strong>Asking:</strong> {selected.map((id) => match?.results.find((r) => r.businessId === id)?.name ?? "selected tailor").join(", ") || "—"}</li>
        </ul>
        <p className="text-stone-600">Each tailor sends an itemised quote. Nothing is charged until you accept one and pay.</p>
        <SubmitButton className="btn-primary w-full" pendingText="Sending…">Send quote requests</SubmitButton>
      </section>

      {stepError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{stepError}</p>}
      <div className="flex gap-3">
        {step > 0 && <button type="button" onClick={back} className="btn-secondary">Back</button>}
        {step < STEPS.length - 1 && <button type="button" onClick={next} className="btn-primary ml-auto">Continue</button>}
      </div>
    </ActionForm>
  );
}
