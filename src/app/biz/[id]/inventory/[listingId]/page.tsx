import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, Dl, PageHeader, Section } from "@/components/ui/basics";
import { Swatch } from "@/components/swatch";
import { db } from "@/lib/db";
import { FABRIC_TYPES, labelOf } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDateTime } from "@/lib/time";
import { listingMovements } from "@/server/services/catalogue";
import { atLeast, availableCenti, businessPage } from "@/server/queries/business";
import { addListingPhotoAction, changeStockAction, removeListingAction, updateListingAction } from "../../../../actions/business";

export const metadata = { title: "Fabric listing" };

const MOVEMENT: Record<string, string> = {
  RESTOCK: "Restocked", ADJUST: "Correction", RESERVE: "Reserved for order", RELEASE: "Reservation released", DEDUCT: "Used / handed over",
};

export default async function ListingPage({ params }: { params: Promise<{ id: string; listingId: string }> }) {
  const { id, listingId } = await params;
  const { actor, role } = await businessPage(id);
  const listing = await db.fabricListing.findUnique({ where: { id: listingId } });
  if (!listing || listing.businessId !== id) notFound();
  const movements = await listingMovements(actor, listingId);
  const orderIds = [...new Set(movements.map((m) => m.orderId).filter((x): x is string => !!x))];
  const orders = orderIds.length ? await db.order.findMany({ where: { id: { in: orderIds }, businessId: id }, select: { id: true, number: true } }) : [];
  const orderNo = new Map(orders.map((o) => [o.id, o.number]));
  const manager = atLeast(role, "MANAGER");
  const unit = listing.unit === "METRE" ? "metres" : "yards";

  return (
    <div className="space-y-6">
      <PageHeader title={listing.name} subtitle={labelOf(FABRIC_TYPES, listing.fabricType)} back={{ href: `/biz/${id}/inventory`, label: "Inventory" }} />

      <Section title="Stock">
        <div className="flex flex-wrap gap-2">
          {(listing.photos.length ? listing.photos : [null]).map((p, i) => (
            <Swatch key={p ?? i} design={listing.fabricType} color={listing.color} imageUrl={p} className="h-20 w-20" />
          ))}
        </div>
        <Dl
          items={[
            ["Available to sell", formatQty(availableCenti(listing), listing.unit)],
            ["Reserved for orders", formatQty(listing.qtyReservedCenti, listing.unit)],
            ["On hand", formatQty(listing.qtyOnHandCenti, listing.unit)],
            ["Price", `${formatMoney(listing.pricePerUnitMinor)} per ${listing.unit === "METRE" ? "metre" : "yard"}`],
            ["Minimum order", formatQty(listing.minOrderCenti, listing.unit)],
            ["Status", listing.status === "ACTIVE" ? <Badge tone="green">Active</Badge> : <Badge>Inactive (hidden from customers)</Badge>],
          ]}
        />
        <ActionForm action={changeStockAction} resetOnSuccess className="space-y-3 border-t border-stone-100 pt-4">
          <h3 className="font-semibold">Change stock</h3>
          <input type="hidden" name="listingId" value={listing.id} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="type">Type</label>
              <select id="type" name="type" className="input">
                <option value="RESTOCK">Restock (add)</option>
                <option value="ADJUST">Correction (+ or −)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="change">Amount in {unit}</label>
              <input id="change" name="change" required inputMode="decimal" className="input" placeholder="e.g. 10 or -2.5" />
            </div>
            <div>
              <label className="label" htmlFor="note">Note</label>
              <input id="note" name="note" maxLength={200} className="input" placeholder="Required for corrections" />
            </div>
          </div>
          <p className="text-xs text-stone-500">Stock on hand can&apos;t go below what is reserved for orders.</p>
          <SubmitButton className="btn-secondary">Update stock</SubmitButton>
        </ActionForm>
      </Section>

      {manager && (
        <Section title="Edit listing">
          <ActionForm action={updateListingAction}>
            <input type="hidden" name="listingId" value={listing.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" name="name" required maxLength={100} defaultValue={listing.name} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="price">Price per {listing.unit === "METRE" ? "metre" : "yard"} (GH₵)</label>
                <input id="price" name="price" required inputMode="decimal" defaultValue={(listing.pricePerUnitMinor / 100).toFixed(2)} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="status">Status</label>
                <select id="status" name="status" defaultValue={listing.status} className="input">
                  <option value="ACTIVE">Active (customers can buy it)</option>
                  <option value="INACTIVE">Inactive (hidden)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="careNotes">Care notes</label>
              <textarea id="careNotes" name="careNotes" rows={2} maxLength={500} defaultValue={listing.careNotes} className="input" />
            </div>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>

          <ActionForm action={addListingPhotoAction} resetOnSuccess className="space-y-3 border-t border-stone-100 pt-4">
            <input type="hidden" name="listingId" value={listing.id} />
            <div>
              <label className="label" htmlFor="photo">Add a photo ({listing.photos.length} of 8)</label>
              <input id="photo" name="photo" type="file" required accept="image/jpeg,image/png,image/webp" className="input" />
            </div>
            <SubmitButton className="btn-secondary">Upload photo</SubmitButton>
          </ActionForm>

          {listing.status === "ACTIVE" && (
            <ActionForm action={removeListingAction} className="space-y-2 border-t border-stone-100 pt-4">
              <input type="hidden" name="listingId" value={listing.id} />
              <p className="text-sm text-stone-600">Deactivating hides this fabric from customers. Fabric reserved for orders must be released first.</p>
              <ConfirmButton>Deactivate listing</ConfirmButton>
            </ActionForm>
          )}
        </Section>
      )}

      <Section title="Stock history">
        {movements.length === 0 ? (
          <p className="text-sm text-stone-600">No stock changes yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {movements.map((m) => {
              const signed = m.type === "ADJUST" ? m.qtyCenti : m.type === "DEDUCT" ? -m.qtyCenti : m.qtyCenti;
              const number = m.orderId ? orderNo.get(m.orderId) : undefined;
              return (
                <li key={m.id} className="space-y-0.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="font-medium">
                      {MOVEMENT[m.type] ?? m.type} {signed < 0 ? "−" : m.type === "RESERVE" || m.type === "RELEASE" ? "" : "+"}{formatQty(Math.abs(signed), listing.unit)}
                    </span>
                    <span className="text-xs text-stone-500">{formatDateTime(m.createdAt)}</span>
                  </div>
                  <p className="text-stone-600">
                    After: {formatQty(m.onHandAfter, listing.unit, true)} on hand, {formatQty(m.reservedAfter, listing.unit, true)} reserved
                    {number ? <> · <Link href={`/biz/${id}/orders/${m.orderId}`} className="text-brand-700 hover:underline">Order #{number}</Link></> : null}
                  </p>
                  {m.note && <p className="break-words text-stone-500">{m.note}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
