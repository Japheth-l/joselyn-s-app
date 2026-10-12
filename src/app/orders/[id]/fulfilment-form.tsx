"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { LocationFields } from "@/components/location-fields";
import { chooseFulfilmentAction } from "@/app/actions/orders";

export function FulfilmentForm({ orderId, businessName, businessAddress, current, savedAddresses }: {
  orderId: string; businessName: string; businessAddress: string; current: string;
  savedAddresses: { id: string; label: string; addressText: string; lat: number | null; lng: number | null }[];
}) {
  const [mode, setMode] = useState(current === "DELIVERY" ? "DELIVERY" : "PICKUP");
  const [saved, setSaved] = useState("");
  const chosen = savedAddresses.find((a) => a.id === saved);
  return (
    <ActionForm action={chooseFulfilmentAction} className="space-y-3">
      <input type="hidden" name="orderId" value={orderId} />
      <fieldset className="space-y-2">
        <legend className="sr-only">Pickup or delivery</legend>
        <label className={`flex gap-3 rounded-xl border p-3 ${mode === "PICKUP" ? "border-brand-600 bg-brand-50" : "border-stone-200"}`}>
          <input type="radio" name="fulfilment" value="PICKUP" checked={mode === "PICKUP"} onChange={() => setMode("PICKUP")} className="mt-1" />
          <span className="text-sm"><span className="block font-medium">I'll collect it</span><span className="text-stone-600">From {businessName}, {businessAddress}. Free.</span></span>
        </label>
        <label className={`flex gap-3 rounded-xl border p-3 ${mode === "DELIVERY" ? "border-brand-600 bg-brand-50" : "border-stone-200"}`}>
          <input type="radio" name="fulfilment" value="DELIVERY" checked={mode === "DELIVERY"} onChange={() => setMode("DELIVERY")} className="mt-1" />
          <span className="text-sm"><span className="block font-medium">Deliver it to me</span><span className="text-stone-600">A verified rider brings it. The fee depends on distance and is added to your balance.</span></span>
        </label>
      </fieldset>
      {mode === "DELIVERY" && (
        <div className="space-y-3">
          {savedAddresses.length > 0 && (
            <div>
              <label className="label" htmlFor="saved">Saved address</label>
              <select id="saved" value={saved} onChange={(e) => setSaved(e.target.value)} className="input">
                <option value="">Enter a new one</option>
                {savedAddresses.map((a) => <option key={a.id} value={a.id}>{a.label}: {a.addressText}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="addressText">Address or landmark</label>
            <input id="addressText" name="addressText" key={saved} defaultValue={chosen?.addressText ?? ""} className="input" required />
          </div>
          <LocationFields key={`loc-${saved}`} required initial={chosen?.lat != null && chosen?.lng != null ? { lat: chosen.lat, lng: chosen.lng } : null} />
        </div>
      )}
      <SubmitButton>Save choice</SubmitButton>
    </ActionForm>
  );
}
