"use client";

import { useEffect } from "react";
import { useLiveLocation } from "./use-location";

/**
 * "Use my current location" button that fills hidden lat/lng inputs. The location is only sent
 * when the form is submitted, and only used for this order (never shown publicly).
 */
export function LocationFields({ required = false, initial, label = "Use my current location", onChange }: {
  required?: boolean;
  initial?: { lat: number; lng: number } | null;
  label?: string;
  onChange?: (loc: { lat: number; lng: number } | null) => void;
}) {
  const { location, setLocation, status, error, request } = useLiveLocation();
  useEffect(() => {
    if (initial && !location) setLocation(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => onChange?.(location), [location, onChange]);
  return (
    <div className="space-y-1">
      <input type="hidden" name="lat" value={location?.lat ?? ""} />
      <input type="hidden" name="lng" value={location?.lng ?? ""} />
      <button type="button" onClick={request} className="btn-secondary w-full sm:w-auto" disabled={status === "locating"}>
        📍 {status === "locating" ? "Finding you…" : location ? "Update my location" : label}
      </button>
      {location && <p className="text-xs text-brand-700">Location captured. It's shared only with the person who accepts this job.</p>}
      {!location && required && <p className="text-xs text-stone-500">Needed so the rider or professional can find you.</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
