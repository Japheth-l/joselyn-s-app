"use client";

import { useCallback, useState } from "react";

export type LatLng = { lat: number; lng: number };

/** Ask the browser for the user's live location. */
export function useLiveLocation() {
  const [location, setLocation] = useState<LatLng | null>(null);
  const [status, setStatus] = useState<"idle" | "locating" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("error");
      setError("Your browser can't share location. Choose your city instead.");
      return;
    }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setStatus("done");
        setError(null);
      },
      (err) => {
        setStatus("error");
        setError(err.code === err.PERMISSION_DENIED
          ? "Location permission was denied. Allow it in your browser, or choose your city instead."
          : "Couldn't get your location. Try again or choose your city.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }, []);

  return { location, setLocation, status, error, request };
}
