"use client";

import dynamic from "next/dynamic";

export type MapPin = { id: string; lat: number; lng: number; label: string; sub?: string; emoji?: string };

// Leaflet touches `window`, so the map only renders in the browser.
export const TailorMap = dynamic(() => import("./map-inner"), {
  ssr: false,
  loading: () => <div className="grid h-[380px] place-items-center rounded-xl bg-stone-100 text-sm text-stone-500">Loading map…</div>,
});
