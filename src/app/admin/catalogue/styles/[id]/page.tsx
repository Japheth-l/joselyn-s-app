import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, Dl, PageHeader, Section } from "@/components/ui/basics";
import { StyleImage } from "@/components/swatch";
import { removeStyleOptionAction, reviewStyleAction, setStyleImageAction, upsertStyleOptionAction } from "@/app/actions/admin";
import { COMPLEXITY, MEASUREMENT_FIELDS, OCCASIONS, WEARERS, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDateTime } from "@/lib/time";
import { requireAdminPage } from "../../../_lib/guard";

export const metadata = { title: "Style" };

const STATUSES: Record<string, string> = { PUBLISHED: "Published", PENDING: "Waiting for review", REJECTED: "Rejected", ARCHIVED: "Archived" };

function OptionForm({ styleId, o }: { styleId: string; o?: { id: string; key: string; label: string; choices: string[]; sortOrder: number } }) {
  const k = o?.id ?? "new";
  return (
    <ActionForm action={upsertStyleOptionAction} resetOnSuccess={!o} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="styleId" value={styleId} />
      <div>
        <label className="label" htmlFor={`key-${k}`}>Key</label>
        {o ? (
          <><input type="hidden" name="key" value={o.key} /><p id={`key-${k}`} className="py-2 font-mono text-sm">{o.key}</p></>
        ) : (
          <input id={`key-${k}`} name="key" required pattern="[a-z][a-zA-Z0-9]*" className="input" placeholder="e.g. sleeve" />
        )}
      </div>
      <div>
        <label className="label" htmlFor={`label-${k}`}>Label</label>
        <input id={`label-${k}`} name="label" required minLength={2} maxLength={40} defaultValue={o?.label} className="input" placeholder="e.g. Sleeve length" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`choices-${k}`}>Choices (comma-separated, at least two)</label>
        <input id={`choices-${k}`} name="choices" required defaultValue={o?.choices.join(", ")} className="input" placeholder="Short, Three-quarter, Long" />
      </div>
      <div>
        <label className="label" htmlFor={`sort-${k}`}>Sort order</label>
        <input id={`sort-${k}`} name="sortOrder" type="number" min={0} max={999} defaultValue={o?.sortOrder ?? 0} className="input" />
      </div>
      <div className="sm:self-end"><SubmitButton className="btn-secondary">{o ? "Save option" : "Add option"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function StyleDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  await requireAdminPage("CATALOGUE");
  const { id } = await params;
  const sp = await searchParams;
  const s = await db.style.findUnique({
    where: { id },
    include: { category: { select: { name: true } }, submittedByBusiness: { select: { name: true } }, options: { orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }, _count: { select: { businesses: true, orders: true } } },
  });
  if (!s) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/catalogue", label: "Catalogue" }}
        title={s.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{s.category.name} <Badge tone={s.status === "PUBLISHED" ? "green" : s.status === "PENDING" ? "gold" : "grey"}>{STATUSES[s.status] ?? s.status}</Badge></span>}
      />
      {sp.created && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Style added and published. Add its design options and a photo below.</p>}

      <Section title="Details">
        <div className="flex flex-col gap-4 sm:flex-row">
          <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="h-32 w-32 shrink-0" />
          <div className="min-w-0 flex-1 space-y-3">
            <Dl items={[
              ["Slug", s.slug],
              ["Worn by", labelOf(WEARERS, s.wearer)],
              ["Complexity", labelOf(COMPLEXITY, s.complexity)],
              ["Fabric usually needed", formatQty(s.fabricQtyCenti, "YARD")],
              ["Indicative sewing price", s.indicativeLabourMinor != null ? formatMoney(s.indicativeLabourMinor) : "Price on request"],
              ["Occasions", s.occasions.map((o) => labelOf(OCCASIONS, o)).join(", ") || "—"],
              ["Measurements needed", s.measurementKeys.map((k) => labelOf(MEASUREMENT_FIELDS, k)).join(", ") || "—"],
              ["Submitted by", s.submittedByBusiness?.name ?? "Platform"],
              ["Offered by", `${s._count.businesses} business${s._count.businesses === 1 ? "" : "es"}`],
              ["Orders", s._count.orders],
              ["Created", formatDateTime(s.createdAt)],
            ]} />
            <p className="whitespace-pre-line break-words text-sm text-stone-700">{s.description}</p>
          </div>
        </div>
      </Section>

      <Section title="Photo">
        <ActionForm action={setStyleImageAction} resetOnSuccess className="space-y-3">
          <input type="hidden" name="styleId" value={s.id} />
          <div>
            <label className="label" htmlFor="photo">{s.imageUrl ? "Replace the photo" : "Add a photo"} (JPG, PNG or WebP, under 5 MB)</label>
            <input id="photo" name="photo" type="file" required accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
          </div>
          <SubmitButton className="btn-secondary" pendingText="Uploading…">Upload photo</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={`Design options (${s.options.length})`}>
        <p className="text-sm text-stone-600">Customers choose one value for each option when ordering this style. The key can't be changed; remove the option and add a new one instead.</p>
        <ul className="divide-y divide-stone-100">
          {s.options.map((o) => (
            <li key={o.id} className="space-y-2 py-4">
              <OptionForm styleId={s.id} o={o} />
              <ActionForm action={removeStyleOptionAction}>
                <input type="hidden" name="optionId" value={o.id} />
                <ConfirmButton confirmText="Tap again to remove">Remove option</ConfirmButton>
              </ActionForm>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-stone-200 pt-4">
          <h3 className="font-semibold">New option</h3>
          <OptionForm styleId={s.id} />
        </div>
      </Section>

      <Section title="Status">
        <ActionForm action={reviewStyleAction} className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
          <input type="hidden" name="styleId" value={s.id} />
          <div>
            <label className="label" htmlFor="decision">Status</label>
            <select id="decision" name="decision" required defaultValue={s.status === "PENDING" ? "" : s.status} className="input">
              <option value="" disabled>Choose…</option>
              <option value="PUBLISHED">Published</option>
              <option value="REJECTED">Rejected</option>
              <option value="ARCHIVED">Archived (hidden from new orders)</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="note">Note (audit log)</label>
            <input id="note" name="note" maxLength={500} className="input" />
          </div>
          <ConfirmButton className="btn-primary" confirmText="Tap again to save">Save status</ConfirmButton>
        </ActionForm>
      </Section>
    </div>
  );
}
