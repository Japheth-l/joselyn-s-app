"use client";

import { useActionState, useState } from "react";
import { addMaterial } from "@/app/actions/business";
import { Swatch } from "@/components/swatch";
import { FABRIC_DESIGNS } from "@/lib/constants";

export function AddMaterialForm() {
  const [state, action, pending] = useActionState(addMaterial, undefined);
  const [design, setDesign] = useState("WAX_PRINT");
  const [color, setColor] = useState("#1d4ed8");

  return (
    <form action={action} className="card space-y-3" key={state?.ok}>
      <h2 className="font-semibold">Add fabric</h2>
      <Swatch design={design} color={color} className="h-16" />
      <div>
        <label className="label" htmlFor="m-name">Name</label>
        <input id="m-name" name="name" className="input" placeholder="e.g. GTP Wax – Sunflower" required />
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label className="label" htmlFor="m-design">Design</label>
          <select id="m-design" name="design" className="input" value={design} onChange={(e) => setDesign(e.target.value)}>
            {Object.entries(FABRIC_DESIGNS).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="m-color">Colour</label>
          <input id="m-color" name="color" type="color" className="h-[38px] w-14 cursor-pointer rounded-lg border border-stone-300" value={color} onChange={(e) => setColor(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="m-price">GH₵ per yard</label>
          <input id="m-price" name="pricePerYard" type="number" step="0.5" min="0.5" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="m-yards">Yards in stock</label>
          <input id="m-yards" name="yardsInStock" type="number" step="0.5" min="0" className="input" required />
        </div>
      </div>
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state?.ok && <p className="text-sm text-brand-700">{state.ok}</p>}
      <button className="btn-primary w-full" disabled={pending}>Add to stock</button>
    </form>
  );
}
