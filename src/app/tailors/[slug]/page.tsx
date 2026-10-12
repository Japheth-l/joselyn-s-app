import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDate } from "@/lib/time";
import { BUSINESS_KINDS, labelOf } from "@/lib/enums";
import { directionsUrl } from "@/lib/geo";
import { StyleImage, Swatch } from "@/components/swatch";
import { Badge, DemoBadge, PageHeader, Section, Stars } from "@/components/ui/basics";

export const dynamic = "force-dynamic";

const DAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]] as const;

export default async function BusinessProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const b = await db.business.findFirst({
    where: { slug: (await params).slug, verificationStatus: "VERIFIED" },
    include: {
      photos: { orderBy: { createdAt: "desc" }, take: 24 },
      styles: { include: { style: true }, where: { style: { status: "PUBLISHED" } } },
      materials: { where: { status: "ACTIVE" }, orderBy: { updatedAt: "desc" }, take: 12 },
      reviews: { where: { status: "PUBLISHED" }, orderBy: { createdAt: "desc" }, take: 20, include: { customer: { select: { name: true } } } },
    },
  });
  if (!b) notFound();
  const hours = (b.operatingHours ?? {}) as Record<string, string | null>;
  const sews = b.kinds.some((k) => k !== "FABRIC_SELLER");

  return (
    <div className="space-y-6">
      <PageHeader
        title={b.name}
        back={{ href: "/tailors", label: "All tailors" }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone="green">✓ Verified</Badge><DemoBadge show={b.isDemo} />{b.kinds.map((k) => labelOf(BUSINESS_KINDS, k)).join(" · ")}</span>}
        actions={sews ? <Link href={`/order/new?business=${b.id}`} className="btn-primary">Request a quote</Link> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {b.description && <p className="whitespace-pre-line text-stone-700">{b.description}</p>}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-stone-600">
            <Stars rating={b.rating} count={b.reviewCount} />
            <span>{b.completedOrders > 0 ? `${b.completedOrders} completed orders on ${BRAND.name}` : `No completed orders on ${BRAND.name} yet`}</span>
            {b.offersWorkshopFitting && <span>Measures at the workshop</span>}
          </p>
          {b.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {b.photos.map((p) => (
                <figure key={p.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={p.caption || `Work by ${b.name}`} className="aspect-square w-full rounded-lg object-cover" />
                  {p.caption && <figcaption className="mt-1 truncate text-xs text-stone-500">{p.caption}</figcaption>}
                </figure>
              ))}
            </div>
          )}
        </div>
        <aside className="card h-fit space-y-3 text-sm">
          <p><strong>Address:</strong> {b.address}, {b.city}</p>
          <a href={directionsUrl(b.lat, b.lng)} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Get directions</a>
          <p><strong>Phone:</strong> <a href={`tel:${b.phone.replace(/\s/g, "")}`} className="text-brand-700 underline">{b.phone}</a></p>
          {Object.keys(hours).length > 0 && (
            <table className="w-full text-xs">
              <caption className="mb-1 text-left text-sm font-semibold">Opening hours</caption>
              <tbody>{DAYS.map(([k, label]) => <tr key={k}><th scope="row" className="py-0.5 text-left font-normal text-stone-500">{label}</th><td className="text-right">{hours[k] || "Closed"}</td></tr>)}</tbody>
            </table>
          )}
        </aside>
      </div>

      {b.styles.length > 0 && (
        <Section title="Styles and prices">
          <ul className="grid gap-3 sm:grid-cols-2">
            {b.styles.map((s) => (
              <li key={s.id} className="flex items-center gap-3">
                <StyleImage icon={s.style.icon} imageUrl={s.style.imageUrl} className="h-14 w-14 shrink-0 text-2xl" />
                <div className="min-w-0 flex-1">
                  <Link href={`/styles/${s.style.slug}`} className="block truncate font-medium hover:text-brand-700">{s.style.name}</Link>
                  <p className="text-xs text-stone-500">{s.priceMinor ? `Sewing ${formatMoney(s.priceMinor)}` : "Price on request"} · about {s.daysToMake} days</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {b.materials.length > 0 && (
        <Section title="Fabrics in stock">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {b.materials.map((f) => (
              <li key={f.id}>
                <Link href={`/fabrics/${f.id}`} className="block space-y-1 hover:text-brand-700">
                  <Swatch design={f.fabricType} color={f.color} imageUrl={f.photos[0]} className="aspect-square w-full" />
                  <p className="truncate text-sm font-medium">{f.name}</p>
                  <p className="text-xs text-stone-500">{formatMoney(f.pricePerUnitMinor)}/{f.unit === "METRE" ? "m" : "yd"} · {formatQty(Math.max(0, f.qtyOnHandCenti - f.qtyReservedCenti), f.unit, true)} left</p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Reviews (${b.reviewCount})`}>
        {b.reviews.length === 0 ? (
          <p className="text-sm text-stone-600">No reviews yet. Only customers who completed an order can review.</p>
        ) : (
          <ul className="space-y-4">
            {b.reviews.map((r) => (
              <li key={r.id} className="space-y-1 border-b border-stone-100 pb-3 last:border-0">
                <p className="text-sm"><span className="text-gold-500">{"★".repeat(r.rating)}</span><span className="text-stone-300">{"★".repeat(5 - r.rating)}</span> <span className="text-stone-500">· {r.customer?.name.split(" ")[0] ?? "Customer"} · {formatDate(r.createdAt)} · verified order</span></p>
                {r.comment && <p className="text-sm text-stone-700">{r.comment}</p>}
                {r.businessResponse && <p className="ml-4 border-l-2 border-stone-200 pl-3 text-sm text-stone-600"><strong>Reply:</strong> {r.businessResponse}</p>}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
