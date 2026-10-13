"use client";

import { useLiveLocation } from "@/components/use-location";

/**
 * "Use my current location" button that fills hidden `lat`/`lng` inputs. Nothing is sent until the
 * form is submitted. Used for saved addresses and a professional's base location.
 */
export function CaptureLocation({ label = "Use my current location", note }: { label?: string; note: string }) {
  const { location, status, error, request } = useLiveLocation();
  return (
    <div className="space-y-1">
      <input type="hidden" name="lat" value={location?.lat ?? ""} />
      <input type="hidden" name="lng" value={location?.lng ?? ""} />
      <button type="button" onClick={request} className="btn-secondary min-h-11 w-full sm:w-auto" disabled={status === "locating"}>
        <span aria-hidden>📍</span> {status === "locating" ? "Finding you…" : location ? "Location captured — tap to update" : label}
      </button>
      {location ? (
        <p role="status" className="text-xs text-brand-700">✓ Location captured. It is saved when you press the save button below.</p>
      ) : (
        <p className="text-xs text-stone-500">{note}</p>
      )}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  );
}
