import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, PageHeader, Section } from "@/components/ui/basics";
import { StyleImage } from "@/components/swatch";
import { createStyleAction, reviewStyleAction, upsertCategoryAction } from "@/app/actions/admin";
import { COMPLEXITY, MEASUREMENT_FIELDS, OCCASIONS, WEARERS, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDateTime } from "@/lib/time";
import { requireAdminPage } from "../_lib/guard";
import { hrefWith } from "../_lib/ui";

export const metadata = { title: "Catalogue" };

const STATUSES: Record<string, string> = { PUBLISHED: "Published", PENDING: "Waiting for review", REJECTED: "Rejected", ARCHIVED: "Archived" };
const tone = (s: string) => (s === "PUBLISHED" ? "green" : s === "PENDING" ? "gold" : s === "REJECTED" ? "red" : "grey") as "green" | "gold" | "red" | "grey";

function CategoryForm({ c }: { c?: { slug: string; name: string; description: string; sortOrder: number; isActive: boolean } }) {
  const k = c?.slug ?? "new";
  return (
    <ActionForm action={upsertCategoryAction} resetOnSuccess={!c} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor={`slug-${k}`}>Slug</label>
        {c ? (
          <><input type="hidden" name="slug" value={c.slug} /><p id={`slug-${k}`} className="py-2 font-mono text-sm">{c.slug}</p></>
        ) : (
          <input id={`slug-${k}`} name="slug" required pattern="[a-z0-9\-]{2,50}" className="input" placeholder="e.g. kaba-and-slit" />
        )}
      </div>
      <div>
        <label className="label" htmlFor={`name-${k}`}>Name</label>
        <input id={`name-${k}`} name="name" required maxLength={60} defaultValue={c?.name} className="input" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`desc-${k}`}>Description</label>
        <input id={`desc-${k}`} name="description" maxLength={300} defaultValue={c?.description} className="input" />
      </div>
      <div>
        <label className="label" htmlFor={`sort-${k}`}>Sort order</label>
        <input id={`sort-${k}`} name="sortOrder" type="number" min={0} max={999} defaultValue={c?.sortOrder ?? 0} className="input" />
      </div>
      <label className="flex min-h-10 items-center gap-2 text-sm sm:self-end">
        <input type="checkbox" name="isActive" defaultChecked={c?.isActive ?? true} className="h-4 w-4" /> Shown to customers
      </label>
      <div className="sm:col-span-2"><SubmitButton className="btn-secondary">{c ? "Save category" : "Add category"}</SubmitButton></div>
    </ActionForm>
  );
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage("CATALOGUE");
  const sp = await searchParams;
  const status = sp.status && sp.status in STATUSES ? sp.status : undefined;
  const [categories, pending, styles] = await Promise.all([
    db.garmentCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { styles: true } } } }),
    db.style.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, include: { category: { select: { name: true } }, submittedByBusiness: { select: { name: true, isDemo: true } } } }),
    db.style.findMany({
      where: status ? { status } : {}, orderBy: [{ status: "asc" }, { name: "asc" }], take: 300,
      select: { id: true, name: true, icon: true, imageUrl: true, status: true, wearer: true, category: { select: { name: true } }, submittedByBusiness: { select: { name: true } }, _count: { select: { options: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Catalogue" subtitle="Garment categories and styles customers can order." />

      <Section title={`Business submissions waiting (${pending.length})`}>
        {pending.length === 0 ? <p className="text-sm text-stone-500">No styles waiting for review.</p> : (
          <ul className="divide-y divide-stone-100">
            {pending.map((s) => (
              <li key={s.id} className="space-y-3 py-4">
                <div className="flex items-start gap-3">
                  <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="h-16 w-16 shrink-0 text-3xl" />
                  <div className="min-w-0">
                    <p className="break-words font-medium"><Link href={`/admin/catalogue/styles/${s.id}`} className="text-brand-700 hover:underline">{s.name}</Link> <DemoBadge show={!!s.submittedByBusiness?.isDemo} /></p>
                    <p className="text-sm text-stone-600">{s.category.name} · {labelOf(WEARERS, s.wearer)} · {labelOf(COMPLEXITY, s.complexity)} · {formatQty(s.fabricQtyCenti, "YARD")}{s.indicativeLabourMinor != null ? ` · from ${formatMoney(s.indicativeLabourMinor)}` : ""}</p>
                    <p className="text-xs text-stone-500">Submitted by {s.submittedByBusiness?.name ?? "—"} · {formatDateTime(s.createdAt)}</p>
                  </div>
                </div>
                <p className="whitespace-pre-line break-words text-sm text-stone-700">{s.description}</p>
                <ActionForm action={reviewStyleAction} className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
                  <input type="hidden" name="styleId" value={s.id} />
                  <div>
                    <label className="label" htmlFor={`dec-${s.id}`}>Decision</label>
                    <select id={`dec-${s.id}`} name="decision" required className="input" defaultValue="">
                      <option value="" disabled>Choose…</option>
                      <option value="PUBLISHED">Publish</option>
                      <option value="REJECTED">Reject</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`note-${s.id}`}>Note (audit log)</label>
                    <input id={`note-${s.id}`} name="note" maxLength={500} className="input" />
                  </div>
                  <SubmitButton>Save</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Styles (${styles.length}${styles.length === 300 ? "+" : ""})`}>
        <nav aria-label="Filter styles" className="flex flex-wrap gap-2">
          {[["", "All"], ...Object.entries(STATUSES)].map(([k, l]) => (
            <Link key={k || "all"} href={hrefWith("/admin/catalogue", {}, { status: k || undefined })} aria-current={(status ?? "") === k ? "page" : undefined}
              className={`rounded-full border px-3 py-1.5 text-sm ${(status ?? "") === k ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-stone-300 bg-white text-stone-700"}`}>{l}</Link>
          ))}
        </nav>
        {styles.length === 0 ? <p className="text-sm text-stone-500">No styles.</p> : (
          <ul className="divide-y divide-stone-100">
            {styles.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/catalogue/styles/${s.id}`} className="flex items-center gap-3 py-2 hover:bg-stone-50">
                  <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="h-10 w-10 shrink-0 text-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate text-xs text-stone-500">{s.category.name} · {labelOf(WEARERS, s.wearer)} · {s._count.options} options{s.submittedByBusiness ? ` · by ${s.submittedByBusiness.name}` : ""}</p>
                  </div>
                  <Badge tone={tone(s.status)}>{STATUSES[s.status] ?? s.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Add a style">
        {categories.length === 0 ? <p className="text-sm text-stone-500">Add a category first.</p> : (
          <ActionForm action={createStyleAction} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="s-name">Name</label>
                <input id="s-name" name="name" required minLength={2} maxLength={80} className="input" />
              </div>
              <div>
                <label className="label" htmlFor="s-cat">Category</label>
                <select id="s-cat" name="categoryId" required className="input" defaultValue="">
                  <option value="" disabled>Choose…</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}{c.isActive ? "" : " (hidden)"}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="s-wearer">Worn by</label>
                <select id="s-wearer" name="wearer" required className="input">
                  {Object.entries(WEARERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="s-cx">Complexity</label>
                <select id="s-cx" name="complexity" required className="input" defaultValue="MODERATE">
                  {Object.entries(COMPLEXITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="s-yards">Fabric usually needed (yards)</label>
                <input id="s-yards" name="fabricYards" required inputMode="decimal" className="input" placeholder="e.g. 5 or 2.5" />
              </div>
              <div>
                <label className="label" htmlFor="s-labour">Indicative sewing price (GH₵, optional)</label>
                <input id="s-labour" name="indicativeLabour" inputMode="decimal" className="input" />
              </div>
              <div>
                <label className="label" htmlFor="s-icon">Icon (emoji, used when there is no photo)</label>
                <input id="s-icon" name="icon" maxLength={8} defaultValue="👗" className="input" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="s-desc">Description</label>
              <textarea id="s-desc" name="description" required minLength={10} maxLength={600} rows={3} className="input" />
            </div>
            <fieldset>
              <legend className="label">Occasions</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {Object.entries(OCCASIONS).map(([k, v]) => <label key={k} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="occasions" value={k} className="h-4 w-4" />{v}</label>)}
              </div>
            </fieldset>
            <fieldset>
              <legend className="label">Measurements needed</legend>
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
                {Object.entries(MEASUREMENT_FIELDS).map(([k, v]) => <label key={k} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="measurementKeys" value={k} className="h-4 w-4" />{v}</label>)}
              </div>
            </fieldset>
            <p className="text-xs text-stone-500">Styles added here are published straight away. Add design options and a photo on the next page.</p>
            <SubmitButton>Add style</SubmitButton>
          </ActionForm>
        )}
      </Section>

      <Section title={`Categories (${categories.length})`}>
        <ul className="divide-y divide-stone-100">
          {categories.map((c) => (
            <li key={c.id} className="space-y-2 py-4">
              <p className="text-sm text-stone-600">{c._count.styles} style{c._count.styles === 1 ? "" : "s"}{c.isActive ? "" : " · hidden from customers"}</p>
              <CategoryForm c={c} />
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t border-stone-200 pt-4">
          <h3 className="font-semibold">New category</h3>
          <CategoryForm />
        </div>
      </Section>
    </div>
  );
}
