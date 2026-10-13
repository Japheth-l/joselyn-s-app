"use client";

import { useLiveLocation } from "@/components/use-location";

/**
 * "Use my current location" for a business form: fills hidden lat/lng inputs. Left empty, the
 * service keeps the saved pin (profile) or uses the city centre (registration).
 */
export function LocationFields({ fallback }: { fallback: string }) {
  const { location, setLocation, status, error, request } = useLiveLocation();
  return (
    <div className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3">
      <input type="hidden" name="lat" value={location ? String(location.lat) : ""} />
      <input type="hidden" name="lng" value={location ? String(location.lng) : ""} />
      <p className="text-sm font-medium text-stone-700">Map pin</p>
      {location ? (
        <p className="break-words text-sm text-stone-700">
          Using your current location ({location.lat.toFixed(5)}, {location.lng.toFixed(5)}). Stand at the workshop when you do this so customers find the right place.
        </p>
      ) : (
        <p className="text-sm text-stone-600">{fallback}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" onClick={request} disabled={status === "locating"}>
          {status === "locating" ? "Finding you…" : location ? "Update location" : "Use my current location"}
        </button>
        {location && <button type="button" className="btn-secondary" onClick={() => setLocation(null)}>Don&apos;t use it</button>}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
