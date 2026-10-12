import { bpsOf } from "@/lib/money";
import { distanceKm } from "@/lib/geo";
import type { Settings } from "./settings";

export function deliveryFeeMinor(km: number, s: Pick<Settings, "deliveryBaseMinor" | "deliveryPerKmMinor">) {
  return s.deliveryBaseMinor + Math.ceil(Math.max(0, km)) * s.deliveryPerKmMinor;
}

export function deliveryFeeBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }, s: Pick<Settings, "deliveryBaseMinor" | "deliveryPerKmMinor">) {
  return deliveryFeeMinor(distanceKm(a.lat, a.lng, b.lat, b.lng), s);
}

export function serviceFeeMinor(subtotalMinor: number, s: Pick<Settings, "serviceFeeBps" | "serviceFeeCapMinor">) {
  return Math.min(bpsOf(Math.max(0, subtotalMinor), s.serviceFeeBps), s.serviceFeeCapMinor);
}

export type QuoteInput = {
  labourMinor: number;
  fabricMinor: number;
  measurementMinor: number;
  otherMinor: number;
  otherDescription?: string;
  discountMinor: number;
  fabricDescription?: string;
};

/** Itemised quotation lines including the platform's service fee. Totals are integer pesewas. */
export function buildQuoteLines(q: QuoteInput, s: Pick<Settings, "serviceFeeBps" | "serviceFeeCapMinor">) {
  const lines: { kind: string; description: string; amountMinor: number }[] = [];
  if (q.labourMinor > 0) lines.push({ kind: "LABOUR", description: "Sewing", amountMinor: q.labourMinor });
  if (q.fabricMinor > 0) lines.push({ kind: "FABRIC", description: q.fabricDescription || "Fabric", amountMinor: q.fabricMinor });
  if (q.measurementMinor > 0) lines.push({ kind: "MEASUREMENT", description: "Home measurement visit", amountMinor: q.measurementMinor });
  if (q.otherMinor > 0) lines.push({ kind: "OTHER", description: q.otherDescription || "Other", amountMinor: q.otherMinor });
  if (q.discountMinor > 0) lines.push({ kind: "DISCOUNT", description: "Discount", amountMinor: -q.discountMinor });
  const subtotal = lines.reduce((t, l) => t + l.amountMinor, 0);
  if (subtotal < 0) throw new Error("Discount is larger than the quotation.");
  const fee = serviceFeeMinor(subtotal, s);
  if (fee > 0) lines.push({ kind: "SERVICE_FEE", description: "Ntoma service fee", amountMinor: fee });
  return { lines, totalMinor: subtotal + fee };
}
