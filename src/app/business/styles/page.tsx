import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { removeStyleOffer, setStyleOffer } from "@/app/actions/business";

export default async function StylesPage() {
  const user = await requireUser("BUSINESS");
  const [styles, offers] = await Promise.all([
    db.style.findMany({ orderBy: { name: "asc" } }),
    db.businessStyle.findMany({ where: { businessId: user.business!.id } }),
  ]);
  const offerFor = new Map(offers.map((o) => [o.styleId, o]));

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        Tick the styles you sew and set your sewing (labour) price. Fabric is charged separately from your stock.
      </p>
      {styles.map((s) => {
        const offer = offerFor.get(s.id);
        return (
          <div key={s.id} className={`card flex flex-wrap items-center gap-4 ${offer ? "border-brand-500" : ""}`}>
            <span className="text-3xl">{s.icon}</span>
            <div className="min-w-40 flex-1">
              <p className="font-semibold">{s.name} {offer && <span className="badge bg-brand-50 text-brand-700">Offered</span>}</p>
              <p className="text-sm text-stone-500">{s.description}</p>
            </div>
            <form action={setStyleOffer.bind(null, s.id)} className="flex items-end gap-2">
              <label className="text-xs text-stone-500">Sewing price (GH₵)
                <input name="price" type="number" min="1" step="1" defaultValue={offer?.price} className="input mt-1 w-28" required />
              </label>
              <label className="text-xs text-stone-500">Days to make
                <input name="daysToMake" type="number" min="1" max="90" defaultValue={offer?.daysToMake ?? 7} className="input mt-1 w-20" required />
              </label>
              <button className="btn-secondary">{offer ? "Update" : "Offer this style"}</button>
            </form>
            {offer && (
              <form action={removeStyleOffer.bind(null, s.id)}>
                <button className="text-sm text-red-700 hover:underline">Stop offering</button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
