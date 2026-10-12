import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { FABRIC_DESIGNS, type FabricDesign } from "@/lib/constants";
import { formatCedis } from "@/lib/geo";
import { Swatch } from "@/components/swatch";
import { BuyFabricForm } from "./buy-form";

export default async function FabricPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("CLIENT");
  const { id } = await params;
  const m = await db.material.findFirst({ where: { id, business: { verificationStatus: "VERIFIED" } }, include: { business: true } });
  if (!m) notFound();

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Swatch design={m.design} color={m.color} imageUrl={m.imageUrl} className="aspect-square w-full" />
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-stone-500">{FABRIC_DESIGNS[m.design as FabricDesign]?.label}</p>
          <h1 className="page-title">{m.name}</h1>
          <p className="text-stone-600">Sold by {m.business.name}, {m.business.address}, {m.business.city}</p>
        </div>
        <p className="text-xl font-bold">{formatCedis(m.pricePerYard)} <span className="text-sm font-normal text-stone-500">per yard · {m.yardsInStock} yards in stock</span></p>
        <BuyFabricForm
          material={{ id: m.id, pricePerYard: m.pricePerYard, yardsInStock: m.yardsInStock }}
          shop={{ lat: m.business.lat, lng: m.business.lng, address: `${m.business.address}, ${m.business.city}` }}
        />
      </div>
    </div>
  );
}
