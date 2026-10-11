"use client";

import L from "leaflet";
import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { MapPin } from "./map";

// Emoji pins avoid Leaflet's default image icons, which don't resolve under bundlers.
function pinIcon(emoji: string, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:${active ? 30 : 24}px;line-height:1;filter:drop-shadow(0 1px 2px #0006);transform:translate(-50%,-100%)">${emoji}</div>`,
    iconSize: [0, 0],
  });
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
    else if (points.length === 1) map.setView(points[0], 13);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function MapInner({
  center, pins, you, selectedId, onSelect, height = 380,
}: {
  center: { lat: number; lng: number };
  pins: MapPin[];
  you?: { lat: number; lng: number } | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const points: [number, number][] = pins.map((p) => [p.lat, p.lng]);
  if (you) points.push([you.lat, you.lng]);

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={12} style={{ height, width: "100%" }} className="z-0 rounded-xl">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {you && (
        <Marker position={[you.lat, you.lng]} icon={pinIcon("🔵", false)}>
          <Popup>You are here</Popup>
        </Marker>
      )}
      {pins.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(p.emoji ?? "📍", p.id === selectedId)}
          eventHandlers={onSelect ? { click: () => onSelect(p.id) } : undefined}
        >
          <Popup>
            <strong>{p.label}</strong>
            {p.sub && <div>{p.sub}</div>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
