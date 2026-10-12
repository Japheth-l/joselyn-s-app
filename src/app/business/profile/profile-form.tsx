"use client";

import { useActionState, useEffect, useState } from "react";
import { updateProfile } from "@/app/actions/business";
import { TailorMap } from "@/components/map";
import { useLiveLocation } from "@/components/use-location";
import { CITIES } from "@/lib/constants";

type Profile = { name: string; description: string; phone: string; address: string; city: string; lat: number; lng: number };

export function ProfileForm({ business }: { business: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const [pos, setPos] = useState({ lat: business.lat, lng: business.lng });
  const live = useLiveLocation();

  useEffect(() => {
    if (live.location) setPos(live.location);
  }, [live.location]);

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-2">
      <div className="card space-y-4">
        <Field label="Business name" name="name" defaultValue={business.name} />
        <div>
          <label className="label" htmlFor="description">About your business</label>
          <textarea id="description" name="description" rows={3} className="input" defaultValue={business.description} placeholder="What you specialise in, years of experience…" />
        </div>
        <Field label="Phone" name="phone" defaultValue={business.phone} />
        <Field label="Shop address / landmark" name="address" defaultValue={business.address} />
        <div>
          <label className="label" htmlFor="city">City</label>
          <select id="city" name="city" className="input" defaultValue={business.city}
            onChange={(e) => { if (!live.location) setPos(CITIES[e.target.value]); }}>
            {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <input type="hidden" name="lat" value={pos.lat} />
        <input type="hidden" name="lng" value={pos.lng} />
        {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
        {state?.ok && <p className="text-sm text-brand-700">{state.ok}</p>}
        <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
      </div>
      <div className="space-y-3">
        <p className="text-sm text-stone-600">
          Clients find you by this pin. Stand in your shop and tap the button to set your exact location.
        </p>
        <button type="button" className="btn-secondary" onClick={live.request}>
          📍 {live.status === "locating" ? "Getting location…" : live.location ? "Pin moved to your location ✓ (save to keep)" : "Set pin to my current location"}
        </button>
        {live.error && <p className="text-sm text-red-700">{live.error}</p>}
        <TailorMap center={pos} pins={[{ id: "shop", lat: pos.lat, lng: pos.lng, label: business.name, emoji: "🧵" }]} />
      </div>
    </form>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" defaultValue={defaultValue} required />
    </div>
  );
}
