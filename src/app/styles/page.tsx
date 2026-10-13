import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { labelOf, OCCASIONS, WEARERS } from "@/lib/enums";
import { StyleImage } from "@/components/swatch";
import { Empty, PageHeader } from "@/components/ui/basics";

export const metadata = { title: "Styles" };
export const dynamic = "force-dynamic";

type SP = { category?: string; wearer?: string; occasion?: string; q?: string };

export default async function StylesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const where: Prisma.StyleWhereInput = {
    status: "PUBLISHED",
    ...(sp.category ? { category: { slug: sp.category } } : {}),
    ...(sp.wearer && sp.wearer in WEARERS ? { wearer: sp.wearer } : {}),
    ...(sp.occasion && sp.occasion in OCCASIONS ? { occasions: { has: sp.occasion } } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { description: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const [categories, styles] = await Promise.all([
    db.garmentCategory.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.style.findMany({
      where, orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }], take: 120,
      include: { category: true, _count: { select: { businesses: { where: { business: { verificationStatus: "VERIFIED" } } } } } },
    }),
  ]);

  return (
    <div>
      <PageHeader title="Styles" subtitle="Choose a style to see its options and the verified tailors who sew it." />
      <form className="card mb-6 grid gap-3 sm:grid-cols-4" role="search">
        <div className="sm:col-span-4">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="e.g. kaba, agbada, shirt" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="category">Garment</label>
          <select id="category" name="category" defaultValue={sp.category ?? ""} className="input">
            <option value="">All</option>
            {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="wearer">For</label>
          <select id="wearer" name="wearer" defaultValue={sp.wearer ?? ""} className="input">
            <option value="">Anyone</option>
            {Object.entries(WEARERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="occasion">Occasion</label>
          <select id="occasion" name="occasion" defaultValue={sp.occasion ?? ""} className="input">
            <option value="">Any</option>
            {Object.entries(OCCASIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary flex-1">Filter</button>
          <Link href="/styles" className="btn-secondary">Clear</Link>
        </div>
      </form>

      {styles.length === 0 ? (
        <Empty title="No styles match">Try fewer filters, or <Link href="/order/new" className="text-brand-700 underline">describe your own design</Link> with photos.</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {styles.map((s) => (
            <li key={s.id}>
              <Link href={`/styles/${s.slug}`} className="card flex h-full flex-col gap-2 p-3 hover:border-brand-500">
                <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="aspect-square w-full" />
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{s.category.name} · {labelOf(WEARERS, s.wearer)}</p>
                <p className="font-semibold leading-snug">{s.name}</p>
                <p className="mt-auto text-xs text-stone-600">
                  {s.indicativeLabourMinor ? `Sewing from about ${formatMoney(s.indicativeLabourMinor)}` : "Price on request"}
                  <br />
                  {s._count.businesses === 0 ? "No verified tailor offers it yet" : `${s._count.businesses} tailor${s._count.businesses === 1 ? "" : "s"}`}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
