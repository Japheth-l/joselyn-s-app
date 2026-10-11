"use client";

import { useState, useTransition } from "react";
import { placeFabricOrder } from "@/app/actions/orders";
import { useLiveLocation } from "@/components/use-location";
import { deliveryFee, distanceKm, formatCedis } from "@/lib/geo";

export function BuyFabricForm({ material, shop }: {
  material: { id: string; pricePerYard: number; yardsInStock: number };
  shop: { lat: number; lng: number; address: string };
}) {
  const [yards, setYards] = useState("6");
  const [fulfilment, setFulfilment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [address, setAddress] = useState("");
  const live = useLiveLocation();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const qty = Number(yards) || 0;
  const fabric = Math.round(qty * material.pricePerYard);
  const delivery = fulfilment === "DELIVERY" && live.location
    ? deliveryFee(distanceKm(shop.lat, shop.lng, live.location.lat, live.location.lng))
    : 0;

  function buy() {
    setError(null);
    start(async () => {
      const res = await placeFabricOrder({ materialId: material.id, yards: qty, fulfilment, location: live.location, address });
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="card space-y-4">
      <div>
        <label className="label" htmlFor="yards">How many yards?</label>
        <input id="yards" className="input" type="number" min={0.5} step={0.5} max={material.yardsInStock} value={yards} onChange={(e) => setYards(e.target.value)} />
        <p className="mt-1 text-xs text-stone-500">Tip: a kaba and slit needs about 6 yards; a shirt about 2.5.</p>
      </div>
      <fieldset>
        <legend className="label">Delivery or pick up?</legend>
        <div className="flex gap-2">
          {(["PICKUP", "DELIVERY"] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFulfilment(f)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${fulfilment === f ? "border-brand-500 bg-brand-50 text-brand-700" : "border-stone-300"}`}>
              {f === "PICKUP" ? "I'll pick it up" : "Deliver to me"}
            </button>
          ))}
        </div>
      </fieldset>
      {fulfilment === "PICKUP" ? (
        <p className="text-sm text-stone-600">Pick up from {shop.address}.</p>
      ) : (
        <div className="space-y-3 rounded-lg bg-stone-50 p-3">
          <button type="button" className="btn-secondary" onClick={live.request}>
            📍 {live.location ? "Live location shared ✓" : live.status === "locating" ? "Getting location…" : "Share my live location"}
          </button>
          {live.error && <p className="text-sm text-red-700">{live.error}</p>}
          <input className="input" placeholder="Address or landmark" value={address} onChange={(e) => setAddress(e.target.value)} aria-label="Address or landmark" />
        </div>
      )}
      <div className="space-y-1 border-t border-stone-200 pt-3 text-sm">
        <div className="flex justify-between"><span>Fabric ({qty} yards)</span><span>{formatCedis(fabric)}</span></div>
        {fulfilment === "DELIVERY" && <div className="flex justify-between"><span>Delivery</span><span>{live.location ? formatCedis(delivery) : "Share location to see"}</span></div>}
        <div className="flex justify-between font-bold"><span>Total</span><span>{formatCedis(fabric + delivery)}</span></div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" onClick={buy}
        disabled={pending || qty <= 0 || qty > material.yardsInStock || (fulfilment === "DELIVERY" && (!live.location || !address))}>
        {pending ? "Placing order…" : "Buy fabric"}
      </button>
    </div>
  );
}
