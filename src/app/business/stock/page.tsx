import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FABRIC_DESIGNS, type FabricDesign } from "@/lib/constants";
import { removeMaterial, updateStock } from "@/app/actions/business";
import { Swatch } from "@/components/swatch";
import { AddMaterialForm } from "./add-form";

export default async function StockPage() {
  const user = await requireUser("BUSINESS");
  const materials = await db.material.findMany({ where: { businessId: user.business!.id }, orderBy: { createdAt: "desc" } });

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Fabric in stock</h2>
        {materials.length === 0 && <p className="card text-stone-600">You haven&apos;t added any fabric yet.</p>}
        {materials.map((m) => (
          <div key={m.id} className="card flex flex-wrap items-center gap-4">
            <Swatch design={m.design} color={m.color} className="h-14 w-14 shrink-0" />
            <div className="min-w-40 flex-1">
              <p className="font-semibold">{m.name}</p>
              <p className="text-sm text-stone-500">
                {FABRIC_DESIGNS[m.design as FabricDesign]?.label}
                {m.yardsInStock === 0 && <span className="badge ml-2 bg-red-100 text-red-700">Out of stock</span>}
              </p>
            </div>
            <form action={updateStock.bind(null, m.id)} className="flex items-end gap-2">
              <label className="text-xs text-stone-500">GH₵/yard
                <input name="pricePerYard" type="number" step="0.5" min="0.5" defaultValue={m.pricePerYard} className="input mt-1 w-24" />
              </label>
              <label className="text-xs text-stone-500">Yards
                <input name="yardsInStock" type="number" step="0.5" min="0" defaultValue={m.yardsInStock} className="input mt-1 w-24" />
              </label>
              <button className="btn-secondary">Save</button>
            </form>
            <form action={removeMaterial.bind(null, m.id)}>
              <button className="text-sm text-red-700 hover:underline">Remove</button>
            </form>
          </div>
        ))}
      </section>
      <aside>
        <AddMaterialForm />
      </aside>
    </div>
  );
}
