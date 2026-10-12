import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { FABRIC_TYPES, labelOf } from "@/lib/enums";
import { Swatch } from "@/components/swatch";
import { DemoBadge, Dl, PageHeader, Stars } from "@/components/ui/basics";
import { currentActor } from "@/server/auth";
import { BuyForm } from "./buy-form";

export const dynamic = "force-dynamic";

export default async function FabricPage({ params }: { params: Promise<{ id: string }> }) {
  const f = await db.fabricListing.findFirst({ where: { id: (await params).id, status: "ACTIVE", business: { verificationStatus: "VERIFIED" } }, include: { business: true } });
  if (!f) notFound();
  const actor = await currentActor();
  const available = f.qtyOnHandCenti - f.qtyReservedCenti;
  const unit = f.unit === "METRE" ? "metre" : "yard";
  const tailorOrders = actor
    ? await db.order.findMany({
        where: { customerId: actor.userId, kind: "CUSTOM", fabricSource: "SELLER", businessId: { not: null }, status: { in: ["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED"] } },
        include: { style: true, business: true },
      })
    : [];

  return (
    <div className="space-y-6">
      <PageHeader title={f.name} back={{ href: "/fabrics", label: "Fabrics" }} subtitle={<span>{labelOf(FABRIC_TYPES, f.fabricType)} <DemoBadge show={f.business.isDemo} /></span>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Swatch design={f.fabricType} color={f.color} imageUrl={f.photos[0]} className="aspect-[4/3] w-full" />
          {f.photos.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.photos.slice(1).map((p) => <img key={p} src={p} alt="" className="aspect-square w-full rounded-lg object-cover" />)}
            </div>
          )}
          <Dl items={[
            ["Price", `${formatMoney(f.pricePerUnitMinor)} per ${unit}`],
            ["Available", available > 0 ? formatQty(available, f.unit) : "Out of stock"],
            ["Colour", f.colorName || "—"],
            ["Pattern", f.pattern || "—"],
            ["Width", f.widthInches ? `${f.widthInches} inches` : "—"],
            ["Minimum order", formatQty(f.minOrderCenti, f.unit)],
          ]} />
          {f.careNotes && <p className="text-sm text-stone-600"><strong>Care:</strong> {f.careNotes}</p>}
          <p className="text-sm">Sold by <Link href={`/tailors/${f.business.slug}`} className="font-semibold text-brand-700 hover:underline">{f.business.name}</Link>, {f.business.city} · <Stars rating={f.business.rating} count={f.business.reviewCount} /></p>
        </div>
        <div>
          {available <= 0 ? (
            <p className="card text-sm text-stone-600">This fabric is out of stock right now.</p>
          ) : actor ? (
            <BuyForm
              listingId={f.id} unitLabel={unit} minOrder={f.minOrderCenti / 100} available={available / 100} unitPriceMinor={f.pricePerUnitMinor}
              tailorOrders={tailorOrders.map((o) => ({ id: o.id, label: `#${o.number} ${o.style?.name ?? "Outfit"} with ${o.business?.name}` }))}
            />
          ) : (
            <div className="card space-y-3 text-sm">
              <p>Log in to order this fabric.</p>
              <Link href={`/login?next=/fabrics/${f.id}`} className="btn-primary">Log in</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
