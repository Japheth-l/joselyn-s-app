"use client";

import { useActionState } from "react";
import { addStyle } from "@/app/actions/admin";

export function AddStyleForm() {
  const [state, action, pending] = useActionState(addStyle, undefined);
  return (
    <form action={action} className="card space-y-3" key={state?.ok}>
      <h2 className="font-semibold">Add a style</h2>
      <input name="name" required className="input" placeholder="Name, e.g. Mermaid gown" aria-label="Name" />
      <textarea name="description" required rows={2} className="input" placeholder="Short description" aria-label="Description" />
      <div className="grid grid-cols-2 gap-2">
        <input name="category" required className="input" placeholder="Category, e.g. Dress" aria-label="Category" />
        <select name="wearer" className="input" aria-label="Who wears it">
          <option value="WOMEN">Women</option><option value="MEN">Men</option><option value="UNISEX">Unisex / kids</option>
        </select>
        <input name="yardsNeeded" type="number" step="0.5" min="0.5" required className="input" placeholder="Yards needed" aria-label="Yards needed" />
        <input name="icon" required maxLength={8} className="input" placeholder="Emoji, e.g. 👗" aria-label="Emoji" />
      </div>
      <label className="label" htmlFor="style-photo">Photo (optional)</label>
      <input id="style-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-brand-700">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>Add style</button>
    </form>
  );
}
