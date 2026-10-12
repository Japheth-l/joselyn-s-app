import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";

// Fields shared by the quote form and the change (revision) form. Rendered on the server inside an ActionForm.

export type QuoteListing = { id: string; name: string; unit: string; pricePerUnitMinor: number; available: number };

export function QuoteFields({
  prefix, fabricFromBusiness, listings, defaultFabricQty, defaultDepositPercent, minDate, defaults,
}: {
  prefix: string;
  fabricFromBusiness: boolean;
  listings: QuoteListing[];
  defaultFabricQty: string;
  defaultDepositPercent: number;
  minDate: string;
  defaults?: { listingId?: string | null; completionDate?: string };
}) {
  const f = (name: string) => `${prefix}-${name}`;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={f("labour")}>Your price for sewing (GH₵)</label>
          <input id={f("labour")} name="labour" inputMode="decimal" required className="input" placeholder="e.g. 250" />
        </div>
        <div>
          <label className="label" htmlFor={f("completionDate")}>Ready by</label>
          <input id={f("completionDate")} name="completionDate" type="date" required min={minDate} defaultValue={defaults?.completionDate} className="input" />
        </div>
      </div>
      {fabricFromBusiness && (
        listings.length === 0 ? (
          <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">
            The customer wants you to supply the fabric, but you have no active fabric listings. Add fabric in Inventory first, or decline.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor={f("fabricListingId")}>Fabric from your stock</label>
              <select id={f("fabricListingId")} name="fabricListingId" required className="input" defaultValue={defaults?.listingId ?? ""}>
                <option value="" disabled>Choose a fabric</option>
                {listings.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} · {formatMoney(l.pricePerUnitMinor)}/{l.unit === "METRE" ? "m" : "yd"} · {formatQty(l.available, l.unit, true)} free
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={f("fabricQty")}>Fabric needed</label>
              <input id={f("fabricQty")} name="fabricQty" inputMode="decimal" required defaultValue={defaultFabricQty} className="input" />
              <p className="mt-1 text-xs text-stone-500">In the listing&apos;s unit (yards or metres). Charged at your listed price.</p>
            </div>
          </div>
        )
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={f("otherAmount")}>Other cost (GH₵, optional)</label>
          <input id={f("otherAmount")} name="otherAmount" inputMode="decimal" className="input" placeholder="e.g. lining, beads" />
        </div>
        <div>
          <label className="label" htmlFor={f("otherDescription")}>What the other cost is for</label>
          <input id={f("otherDescription")} name="otherDescription" maxLength={80} className="input" />
        </div>
        <div>
          <label className="label" htmlFor={f("discount")}>Discount (GH₵, optional)</label>
          <input id={f("discount")} name="discount" inputMode="decimal" className="input" />
        </div>
        <div>
          <label className="label" htmlFor={f("depositPercent")}>Deposit before sewing (%)</label>
          <input id={f("depositPercent")} name="depositPercent" type="number" min={0} max={100} step={1} defaultValue={defaultDepositPercent} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor={f("message")}>Message to the customer (optional)</label>
        <textarea id={f("message")} name="message" rows={3} maxLength={1000} className="input" />
      </div>
      <p className="text-xs text-stone-500">
        A home measurement visit fee (if any) and the platform&apos;s service fee are added to the customer&apos;s total automatically and shown as separate lines.
      </p>
    </div>
  );
}
