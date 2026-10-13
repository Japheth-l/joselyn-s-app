import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, Section } from "@/components/ui/basics";
import { Swatch } from "@/components/swatch";
import { db } from "@/lib/db";
import { FABRIC_TYPES, labelOf } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatQty, UNITS } from "@/lib/qty";
import { atLeast, availableCenti, businessPage, lowStockThreshold } from "@/server/queries/business";
import { createListingAction } from "../../../actions/business";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await businessPage(id);
  const listings = await db.fabricListing.findMany({ where: { businessId: id }, orderBy: [{ status: "asc" }, { name: "asc" }] });
  const manager = atLeast(role, "MANAGER");

  return (
    <div className="space-y-6">
      <Section title="Your fabric">
        {listings.length === 0 ? (
          <Empty title="No fabric listed yet">Add the fabric you sell or use for customers&apos; outfits. Stock is tracked automatically as orders reserve and use it.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">
            {listings.map((l) => {
              const avail = availableCenti(l);
              return (
                <li key={l.id}>
                  <Link href={`/biz/${id}/inventory/${l.id}`} className="flex items-start gap-3 py-3 hover:bg-stone-50">
                    <Swatch design={l.fabricType} color={l.color} imageUrl={l.photos[0]} className="h-14 w-14 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="min-w-0 truncate font-semibold">{l.name}</p>
                        {l.status === "ACTIVE" ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                        {l.status === "ACTIVE" && avail < lowStockThreshold(l.unit) && <Badge tone="gold">Low stock</Badge>}
                      </div>
                      <p className="text-sm text-stone-600">{labelOf(FABRIC_TYPES, l.fabricType)} · {formatMoney(l.pricePerUnitMinor)} per {labelOf({ YARD: "yard", METRE: "metre" }, l.unit)}</p>
                      <p className="text-sm text-stone-700">
                        {formatQty(avail, l.unit)} available · {formatQty(l.qtyReservedCenti, l.unit)} reserved · {formatQty(l.qtyOnHandCenti, l.unit)} on hand
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {manager ? (
        <Section title="Add fabric">
          <ActionForm action={createListingAction} resetOnSuccess>
            <input type="hidden" name="businessId" value={id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" name="name" required maxLength={100} className="input" placeholder="e.g. Royal blue Kente" />
              </div>
              <div>
                <label className="label" htmlFor="fabricType">Type</label>
                <select id="fabricType" name="fabricType" required className="input">
                  {Object.entries(FABRIC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="pattern">Pattern (optional)</label>
                <input id="pattern" name="pattern" maxLength={80} className="input" />
              </div>
              <div className="grid grid-cols-[auto_1fr] items-end gap-3">
                <div>
                  <label className="label" htmlFor="color">Main colour</label>
                  <input id="color" name="color" type="color" defaultValue="#1f5a42" className="h-10 w-14 rounded-lg border border-stone-300 bg-white p-1" />
                </div>
                <div>
                  <label className="label" htmlFor="colorName">Colour name</label>
                  <input id="colorName" name="colorName" maxLength={40} className="input" placeholder="e.g. royal blue" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="unit">Sold by</label>
                <select id="unit" name="unit" className="input">
                  {Object.entries(UNITS).map(([k, v]) => <option key={k} value={k}>{v.one}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="price">Price per unit (GH₵)</label>
                <input id="price" name="price" required inputMode="decimal" className="input" placeholder="e.g. 45" />
              </div>
              <div>
                <label className="label" htmlFor="quantity">Quantity in stock</label>
                <input id="quantity" name="quantity" required inputMode="decimal" className="input" placeholder="e.g. 30 or 12.5" />
              </div>
              <div>
                <label className="label" htmlFor="minOrder">Minimum order</label>
                <input id="minOrder" name="minOrder" inputMode="decimal" defaultValue="0.5" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="widthInches">Width in inches (optional)</label>
                <input id="widthInches" name="widthInches" type="number" min={10} max={120} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="photos">Photos (optional, up to 4)</label>
                <input id="photos" name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp" className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="careNotes">Care notes (optional)</label>
              <textarea id="careNotes" name="careNotes" rows={2} maxLength={500} className="input" />
            </div>
            <SubmitButton pendingText="Adding…">Add fabric</SubmitButton>
          </ActionForm>
        </Section>
      ) : (
        <p className="text-sm text-stone-600">Only owners and managers can add fabric. You can record restocks on each listing.</p>
      )}
    </div>
  );
}
