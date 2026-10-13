import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, Section } from "@/components/ui/basics";
import { StyleImage } from "@/components/swatch";
import { db } from "@/lib/db";
import { COMPLEXITY, labelOf, MEASUREMENT_FIELDS, OCCASIONS, WEARERS } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDate } from "@/lib/time";
import { atLeast, businessPage } from "@/server/queries/business";
import { removeStyleOfferAction, setStyleOfferAction, submitStyleAction } from "../../../actions/business";

export const metadata = { title: "Styles" };

const SUBMISSION: Record<string, { label: string; tone: "gold" | "green" | "red" | "grey" }> = {
  PENDING: { label: "Waiting for review", tone: "gold" },
  PUBLISHED: { label: "Published", tone: "green" },
  REJECTED: { label: "Not accepted", tone: "red" },
  ARCHIVED: { label: "Archived", tone: "grey" },
};

export default async function StylesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role } = await businessPage(id);
  const manager = atLeast(role, "MANAGER");
  const [styles, offers, categories, submissions] = await Promise.all([
    db.style.findMany({ where: { status: "PUBLISHED" }, include: { category: true }, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }] }),
    db.businessStyle.findMany({ where: { businessId: id } }),
    db.garmentCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.style.findMany({ where: { submittedByBusinessId: id }, include: { category: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const offerFor = new Map(offers.map((o) => [o.styleId, o]));
  const offered = styles.filter((s) => offerFor.has(s.id));
  const others = styles.filter((s) => !offerFor.has(s.id));

  const styleRow = (s: (typeof styles)[number]) => {
    const offer = offerFor.get(s.id);
    return (
      <li key={s.id} className="space-y-3 py-4">
        <div className="flex items-start gap-3">
          <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="h-14 w-14 shrink-0 text-3xl" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{s.name}</p>
            <p className="text-sm text-stone-600">
              {s.category.name} · {labelOf(WEARERS, s.wearer)} · about {formatQty(s.fabricQtyCenti)}
            </p>
            {offer && (
              <p className="text-sm text-stone-800">
                You charge {offer.priceMinor != null ? `from ${formatMoney(offer.priceMinor)}` : "price on request"} · ready in {offer.daysToMake} day{offer.daysToMake === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>
        {manager && (
          <div className="flex flex-wrap items-end gap-3">
            <ActionForm action={setStyleOfferAction} className="flex flex-wrap items-end gap-3" showSuccess>
              <input type="hidden" name="businessId" value={id} />
              <input type="hidden" name="styleId" value={s.id} />
              <div className="w-32">
                <label className="label" htmlFor={`price-${s.id}`}>Sewing price (GH₵)</label>
                <input id={`price-${s.id}`} name="price" inputMode="decimal" defaultValue={offer?.priceMinor != null ? (offer.priceMinor / 100).toFixed(2) : ""} placeholder="On request" className="input" />
              </div>
              <div className="w-24">
                <label className="label" htmlFor={`days-${s.id}`}>Days to make</label>
                <input id={`days-${s.id}`} name="daysToMake" type="number" min={1} max={120} required defaultValue={offer?.daysToMake ?? 7} className="input" />
              </div>
              <SubmitButton className={offer ? "btn-secondary" : "btn-primary"}>{offer ? "Save" : "I sew this"}</SubmitButton>
            </ActionForm>
            {offer && (
              <ActionForm action={removeStyleOfferAction}>
                <input type="hidden" name="businessId" value={id} />
                <input type="hidden" name="styleId" value={s.id} />
                <ConfirmButton>Remove</ConfirmButton>
              </ActionForm>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <Section title="Styles you sew">
        <p className="text-sm text-stone-600">
          Customers can only ask you for quotes on styles listed here. Leave the price empty to show &ldquo;price on request&rdquo;.
        </p>
        {offered.length === 0 ? (
          <Empty title="You haven't chosen any styles yet">Pick the styles you sew from the catalogue below.</Empty>
        ) : (
          <ul className="divide-y divide-stone-100">{offered.map(styleRow)}</ul>
        )}
      </Section>

      <Section title="Catalogue">
        {others.length === 0 ? (
          <p className="text-sm text-stone-600">{styles.length === 0 ? "The catalogue is empty." : "You've added every style in the catalogue."}</p>
        ) : (
          <ul className="divide-y divide-stone-100">{others.map(styleRow)}</ul>
        )}
      </Section>

      <Section title="Your own designs">
        {submissions.length === 0 ? (
          <p className="text-sm text-stone-600">You haven&apos;t submitted any designs.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {submissions.map((s) => (
              <li key={s.id} className="flex items-start gap-3 py-3">
                <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="h-12 w-12 shrink-0 text-2xl" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-stone-600">{s.category.name} · submitted {formatDate(s.createdAt)}</p>
                </div>
                <Badge tone={SUBMISSION[s.status]?.tone ?? "grey"}>{SUBMISSION[s.status]?.label ?? s.status}</Badge>
              </li>
            ))}
          </ul>
        )}

        {manager ? (
          <details className="rounded-lg border border-stone-200 p-3">
            <summary className="cursor-pointer font-semibold">Submit your own design</summary>
            <ActionForm action={submitStyleAction} resetOnSuccess className="mt-4 space-y-4">
              <input type="hidden" name="businessId" value={id} />
              <p className="text-sm text-stone-600">An administrator reviews new designs before they appear in the catalogue. Once published, add it to your styles above.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="s-name">Name</label>
                  <input id="s-name" name="name" required minLength={2} maxLength={80} className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="s-category">Category</label>
                  <select id="s-category" name="categoryId" required className="input" defaultValue="">
                    <option value="" disabled>Choose a category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="s-wearer">Who wears it</label>
                  <select id="s-wearer" name="wearer" className="input">
                    {Object.entries(WEARERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="s-complexity">Complexity</label>
                  <select id="s-complexity" name="complexity" className="input" defaultValue="MODERATE">
                    {Object.entries(COMPLEXITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="s-labour">Indicative sewing price (GH₵, optional)</label>
                  <input id="s-labour" name="indicativeLabour" inputMode="decimal" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="s-yards">Fabric usually needed (yards)</label>
                  <input id="s-yards" name="fabricYards" required inputMode="decimal" className="input" placeholder="e.g. 5 or 2.5" />
                </div>
                <div>
                  <label className="label" htmlFor="s-icon">Icon (emoji)</label>
                  <input id="s-icon" name="icon" maxLength={8} defaultValue="👗" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="s-photo">Photo (optional)</label>
                  <input id="s-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="input" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="s-description">Description</label>
                <textarea id="s-description" name="description" required minLength={10} maxLength={600} rows={3} className="input" />
              </div>
              <fieldset>
                <legend className="label">Occasions</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(OCCASIONS).map(([k, v]) => (
                    <label key={k} className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm">
                      <input type="checkbox" name="occasions" value={k} /> {v}
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">Measurements needed</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {Object.entries(MEASUREMENT_FIELDS).map(([k, v]) => (
                    <label key={k} className="flex min-h-10 items-center gap-2 rounded-lg border border-stone-200 px-3 text-sm">
                      <input type="checkbox" name="measurementKeys" value={k} /> {v}
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton pendingText="Submitting…">Submit for review</SubmitButton>
            </ActionForm>
          </details>
        ) : (
          <p className="text-sm text-stone-600">Only owners and managers can change styles or submit designs.</p>
        )}
      </Section>
    </div>
  );
}
