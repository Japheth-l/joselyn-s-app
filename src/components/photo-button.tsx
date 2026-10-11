"use client";

import { useRef, useTransition } from "react";

/** A button that opens the camera/gallery and uploads the chosen photo straight away. */
export function PhotoButton({ action, label }: { action: (formData: FormData) => Promise<void>; label: string }) {
  const input = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form ref={form} action={(fd) => start(() => action(fd))}>
      <input ref={input} type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={() => form.current?.requestSubmit()} />
      <button type="button" className="text-sm font-medium text-brand-700 hover:underline" disabled={pending} onClick={() => input.current?.click()}>
        📷 {pending ? "Uploading…" : label}
      </button>
    </form>
  );
}
