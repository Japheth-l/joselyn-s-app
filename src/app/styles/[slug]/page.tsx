import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { COMPLEXITY, labelOf, MEASUREMENT_FIELDS, OCCASIONS, WEARERS } from "@/lib/enums";
import { StyleImage } from "@/components/swatch";
import { Badge, DemoBadge, PageHeader, Section, Stars } from "@/components/ui/basics";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const s = await db.style.findFirst({ where: { slug: (await params).slug, status: "PUBLISHED" } });
  return { title: s?.name ?? "Style" };
}

export default async function StylePage({ params }: { params: Promise<{ slug: string }> }) {
  const style = await db.style.findFirst({
    where: { slug: (await params).slug, status: "PUBLISHED" },
    include: {
      category: true,
      options: { orderBy: { sortOrder: "asc" } },
      businesses: { where: { business: { verificationStatus: "VERIFIED" } }, include: { business: true }, orderBy: { priceMinor: { sort: "asc", nulls: "last" } } },
    },
  });
  if (!style) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title={style.name} back={{ href: `/styles?category=${style.category.slug}`, label: style.category.name }} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <StyleImage icon={style.icon} imageUrl={style.imageUrl} className="aspect-square w-full text-7xl" />
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>{labelOf(WEARERS, style.wearer)}</Badge>
            <Badge>{labelOf(COMPLEXITY, style.complexity)}</Badge>
            {style.occasions.map((o) => <Badge key={o} tone="gold">{labelOf(OCCASIONS, o)}</Badge>)}
          </div>
          <p className="text-stone-700">{style.description}</p>
          <ul className="space-y-1 text-sm text-stone-700">
            <li>🧵 Usually needs about <strong>{formatQty(style.fabricQtyCenti, "YARD")}</strong> of fabric.</li>
            <li>💰 {style.indicativeLabourMinor ? <>Sewing typically from about <strong>{formatMoney(style.indicativeLabourMinor)}</strong> (fabric extra). Tailors set their own prices.</> : "Price on request: tailors quote for it."}</li>
            <li>📏 Measurements: {style.measurementKeys.map((k) => labelOf(MEASUREMENT_FIELDS, k)).join(", ")}.</li>
          </ul>
          <Link href={`/order/new?style=${style.slug}`} className="btn-primary w-full sm:w-auto">Order this style</Link>
        </div>
      </div>

      {style.options.length > 0 && (
        <Section title="Choose your details">
          <p className="text-sm text-stone-600">You'll pick these when you order.</p>
          <dl className="grid gap-3 sm:grid-cols-2">
            {style.options.map((o) => (
              <div key={o.id}>
                <dt className="text-sm font-medium">{o.label}</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">{o.choices.map((c) => <span key={c} className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs">{c}</span>)}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Section title={`Who sews it (${style.businesses.length})`}>
        {style.businesses.length === 0 ? (
          <p className="text-sm text-stone-600">No verified tailor offers this style yet. You can still describe it in a custom order and ask tailors for quotes.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {style.businesses.map((bs) => (
              <li key={bs.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="min-w-0">
                  <Link href={`/tailors/${bs.business.slug}`} className="font-semibold hover:text-brand-700">{bs.business.name}</Link>{" "}
                  <DemoBadge show={bs.business.isDemo} />
                  <p className="text-xs text-stone-500">{bs.business.city} · <Stars rating={bs.business.rating} count={bs.business.reviewCount} /></p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{bs.priceMinor ? formatMoney(bs.priceMinor) : "Price on request"}</p>
                  <p className="text-xs text-stone-500">about {bs.daysToMake} days to make</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-stone-500">When you order, we compare them by distance from you, your budget and your date.</p>
      </Section>
    </div>
  );
}
