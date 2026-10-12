"use client";

import { useActionState } from "react";
import { addPortfolioPhoto } from "@/app/actions/business";

export function AddPhotoForm() {
  const [state, action, pending] = useActionState(addPortfolioPhoto, undefined);
  return (
    <form action={action} className="card space-y-3" key={state?.ok}>
      <h2 className="font-semibold">Add a photo</h2>
      <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="block w-full text-sm" aria-label="Photo" />
      <input name="caption" className="input" placeholder="Caption, e.g. Bridal kaba in beaded lace" maxLength={200} aria-label="Caption" />
      <p className="text-xs text-stone-500">JPG, PNG or WebP, up to 3 MB.</p>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-brand-700">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Uploading…" : "Upload"}</button>
    </form>
  );
}
