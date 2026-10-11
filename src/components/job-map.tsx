"use client";

import { TailorMap, type MapPin } from "./map";

// Small map wrapper usable from server components (which can't pass event handlers).
export function JobMap({ pins }: { pins: MapPin[] }) {
  return <TailorMap center={{ lat: pins[0].lat, lng: pins[0].lng }} pins={pins} height={220} />;
}
