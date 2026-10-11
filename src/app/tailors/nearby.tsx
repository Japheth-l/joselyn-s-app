"use client";

import Link from "next/link";
import { useState } from "react";
import { TailorMap } from "@/components/map";
import { useLiveLocation } from "@/components/use-location";
import { BUSINESS_KINDS } from "@/lib/constants";
import { distanceKm, formatCedis } from "@/lib/geo";

type Tailor = {
  id: string; name: string; kind: string; address: string; city: string; phone: string; lat: number; lng: number;
  rating: number; styles: string[]; fromPrice: number; homeKm: number;
};

export function NearbyTailors({ home, tailors }: { home: { lat: number; lng: number }; tailors: Tailor[] }) {
  const live = useLiveLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const here = live.location ?? home;
  const list = tailors
    .map((t) => ({ ...t, km: live.location ? distanceKm(here.lat, here.lng, t.lat, t.lng) : t.homeKm }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={live.request} disabled={live.status === "locating"}>
          📍 {live.location ? "Showing tailors near your live location ✓" : live.status === "locating" ? "Getting location…" : "Use my current location"}
        </button>
        {live.error && <span className="text-sm text-red-700">{live.error}</span>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <ul className="order-2 space-y-3 lg:order-1">
          {list.map((t) => (
            <li key={t.id} className={`card cursor-pointer ${selected === t.id ? "border-brand-500 ring-2 ring-brand-100" : ""}`} onClick={() => setSelected(t.id)}>
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">{t.name}</p>
                  <p className="text-sm text-stone-500">
                    {BUSINESS_KINDS[t.kind as keyof typeof BUSINESS_KINDS]} · {t.address}, {t.city}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{t.km.toFixed(1)} km</p>
                  {t.rating > 0 && <p>⭐ {t.rating.toFixed(1)}</p>}
                </div>
              </div>
              <p className="mt-2 text-xs text-stone-500">Sews: {t.styles.join(", ")}</p>
              <p className="mt-1 text-sm">Sewing from <strong>{formatCedis(t.fromPrice)}</strong> · 📞 {t.phone}</p>
            </li>
          ))}
        </ul>
        <div className="order-1 lg:sticky lg:top-4 lg:order-2 lg:self-start">
          <TailorMap
            center={here}
            you={here}
            height={480}
            selectedId={selected}
            onSelect={setSelected}
            pins={list.map((t) => ({ id: t.id, lat: t.lat, lng: t.lng, label: t.name, sub: `${t.km.toFixed(1)} km away`, emoji: "🧵" }))}
          />
          <Link href="/order/new" className="btn-primary mt-4 w-full">Start an order</Link>
        </div>
      </div>
    </div>
  );
}
