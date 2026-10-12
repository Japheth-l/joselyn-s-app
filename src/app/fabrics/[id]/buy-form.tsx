"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { LocationFields } from "@/components/location-fields";
import { buyFabricAction } from "@/app/actions/orders";

export function BuyForm({ listingId, unitLabel, minOrder, available, unitPriceMinor, tailorOrders }: {
  listingId: string; unitLabel: string; minOrder: number; available: number; unitPriceMinor: number;
  tailorOrders: { id: string; label: string }[];
}) {
  const [mode, setMode] = useState<"PICKUP" | "DELIVERY" | "TAILOR">("PICKUP");
  const [qty, setQty] = useState(String(minOrder));
  const n = Number(qty);
  const estimate = Number.isFinite(n) && n > 0 ? Math.floor((unitPriceMinor * Math.round(n * 100) + 50) / 100) : null;
  return (
    <ActionForm action={buyFabricAction} className="card space-y-4">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="hidden" name="fulfilment" value={mode === "PICKUP" ? "PICKUP" : "DELIVERY"} />
      <div>
        <label className="label" htmlFor="quantity">How many {unitLabel}s?</label>
        <input id="quantity" name="quantity" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className="input" required />
        <p className="mt-1 text-xs text-stone-500">Minimum {minOrder} · {available} available{estimate != null ? ` · fabric about GH₵ ${(estimate / 100).toFixed(2)} before fees` : ""}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="label">How do you want it?</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "PICKUP"} onChange={() => setMode("PICKUP")} /> I'll collect it from the seller</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="mode" checked={mode === "DELIVERY"} onChange={() => setMode("DELIVERY")} /> Deliver it to me</label>
        <label className={`flex items-center gap-2 text-sm ${tailorOrders.length === 0 ? "text-stone-400" : ""}`}>
          <input type="radio" name="mode" disabled={tailorOrders.length === 0} checked={mode === "TAILOR"} onChange={() => setMode("TAILOR")} /> Deliver it to my tailor
          {tailorOrders.length === 0 && <span className="text-xs">(needs a custom order that uses seller fabric)</span>}
        </label>
      </fieldset>
      {mode === "TAILOR" && (
        <div>
          <label className="label" htmlFor="forOrderId">For which order?</label>
          <select id="forOrderId" name="forOrderId" className="input" required>
            {tailorOrders.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      )}
      {mode === "DELIVERY" && (
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="addressText">Delivery address or landmark</label>
            <input id="addressText" name="addressText" className="input" required placeholder="e.g. House 12, behind Osu Presby church" />
          </div>
          <LocationFields required />
        </div>
      )}
      <p className="text-xs text-stone-500">The seller confirms the fabric is available before you pay. The stock is held for you meanwhile.</p>
      <SubmitButton className="btn-primary w-full">Order fabric</SubmitButton>
    </ActionForm>
  );
}
