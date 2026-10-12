"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TailorMap } from "@/components/map";
import { useLiveLocation } from "@/components/use-location";

export type DirectoryEntry = {
  id: string; slug: string; name: string; city: string; lat: number; lng: number; kinds: string[];
  rating: number; reviewCount: number; completedOrders: number; styles: number; fabrics: number; isDemo: boolean; photo: string | null;
};

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export function Directory({ entries, kindLabels, center }: { entries: DirectoryEntry[]; kindLabels: Record<string, string>; center: { lat: number; lng: number } }) {
  const { location, status, error, request } = useLiveLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const sorted = useMemo(() => {
    const withKm = entries.map((e) => ({ ...e, km: location ? km(location, e) : null }));
    return location ? withKm.sort((a, b) => (a.km ?? 0) - (b.km ?? 0)) : withKm;
  }, [entries, location]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={request} className="btn-secondary" disabled={status === "locating"}>
          📍 {status === "locating" ? "Finding you…" : location ? "Update my location" : "Sort by distance from me"}
        </button>
        <p className="text-xs text-stone-500">Your location stays on your device; it's only used to sort this list.</p>
        {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
      </div>
      <TailorMap
        center={location ?? center}
        you={location}
        selectedId={selected}
        onSelect={setSelected}
        pins={entries.map((e) => ({ id: e.id, lat: e.lat, lng: e.lng, label: e.name, sub: e.city, emoji: e.kinds.includes("FABRIC_SELLER") && e.kinds.length === 1 ? "🧵" : "✂️" }))}
      />
      <ul className="grid gap-3 sm:grid-cols-2">
        {sorted.map((e) => (
          <li key={e.id} id={`b-${e.id}`}>
            <Link href={`/tailors/${e.slug}`} className={`card flex gap-3 p-3 hover:border-brand-500 ${selected === e.id ? "border-brand-500 ring-2 ring-brand-100" : ""}`}>
              {e.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.photo} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <span aria-hidden className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-brand-50 text-2xl">✂️</span>
              )}
              <div className="min-w-0 space-y-0.5">
                <p className="truncate font-semibold">{e.name} {e.isDemo && <span className="badge bg-sky-100 text-sky-800">Demo listing</span>}</p>
                <p className="truncate text-xs text-stone-500">{e.kinds.map((k) => kindLabels[k] ?? k).join(" · ")} · {e.city}{e.km != null ? ` · ${e.km} km` : ""}</p>
                <p className="text-xs text-stone-600">
                  {e.reviewCount > 0 ? <>★ {e.rating.toFixed(1)} ({e.reviewCount})</> : "No reviews yet"}
                  {e.completedOrders > 0 ? ` · ${e.completedOrders} completed` : ""}
                  {e.styles > 0 ? ` · ${e.styles} styles` : ""}{e.fabrics > 0 ? ` · ${e.fabrics} fabrics` : ""}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
