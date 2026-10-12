"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** A pending-aware submit button that sends `intent=<value>` with the form (e.g. save draft vs submit). */
export function IntentButton({ value, children, className = "btn-primary" }: { value: string; children: ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="intent" value={value} className={className} disabled={pending}>
      {pending ? "Please wait…" : children}
    </button>
  );
}
