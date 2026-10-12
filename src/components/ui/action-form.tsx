"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { ok?: string; error?: string } | undefined;
type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/**
 * A form bound to a server action. Shows the action's error or success message, disables itself while
 * submitting, and can reset after success. Authorisation is always enforced on the server.
 */
export function ActionForm({
  action, children, className = "space-y-4", resetOnSuccess = false, showSuccess = true, id,
}: { action: Action; children: ReactNode; className?: string; resetOnSuccess?: boolean; showSuccess?: boolean; id?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} id={id} aria-busy={pending}>
      {children}
      {state?.error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.error}</p>}
      {showSuccess && state?.ok && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{state.ok}</p>}
    </form>
  );
}

export function SubmitButton({ children, className = "btn-primary", pendingText }: { children: ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText ?? "Please wait…" : children}
    </button>
  );
}

/** Two-step button for actions that are hard to undo: the first tap arms it, the second submits. */
export function ConfirmButton({ children, confirmText = "Tap again to confirm", className = "btn-danger" }: { children: ReactNode; confirmText?: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 6000);
    return () => clearTimeout(t);
  }, [armed]);
  if (!armed) {
    return <button type="button" className={className} disabled={pending} onClick={() => setArmed(true)}>{children}</button>;
  }
  return <button type="submit" className={`${className} ring-2 ring-offset-1 ring-red-300`} disabled={pending} autoFocus>{pending ? "Please wait…" : confirmText}</button>;
}
