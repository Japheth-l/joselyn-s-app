import Link from "next/link";
import { db } from "@/lib/db";
import { BUSINESS_KINDS, CITIES } from "@/lib/enums";
import { Empty, PageHeader } from "@/components/ui/basics";
import { Directory } from "./directory";

export const metadata = { title: "Tailors and sellers" };
export const dynamic = "force-dynamic";

export default async function TailorsPage({ searchParams }: { searchParams: Promise<{ city?: string; kind?: string; q?: string }> }) {
  const sp = await searchParams;
  const businesses = await db.business.findMany({
    where: {
      verificationStatus: "VERIFIED",
      ...(sp.city && sp.city in CITIES ? { city: sp.city } : {}),
      ...(sp.kind && sp.kind in BUSINESS_KINDS ? { kinds: { has: sp.kind } } : {}),
      ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}),
    },
    orderBy: [{ isDemo: "asc" }, { completedOrders: "desc" }, { name: "asc" }],
    take: 200,
    include: { photos: { take: 1, orderBy: { createdAt: "desc" } }, _count: { select: { styles: true, materials: { where: { status: "ACTIVE" } } } } },
  });
  const center = sp.city && sp.city in CITIES ? CITIES[sp.city] : CITIES.Accra;

  return (
    <div>
      <PageHeader title="Tailors, seamstresses and fabric sellers" subtitle="Every business here has been verified by our team." />
      <form className="card mb-6 grid gap-3 sm:grid-cols-4" role="search">
        <div>
          <label className="label" htmlFor="q">Name</label>
          <input id="q" name="q" defaultValue={sp.q} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="city">City</label>
          <select id="city" name="city" defaultValue={sp.city ?? ""} className="input">
            <option value="">All cities</option>
            {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="kind">Type</label>
          <select id="kind" name="kind" defaultValue={sp.kind ?? ""} className="input">
            <option value="">All</option>
            {Object.entries(BUSINESS_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary flex-1">Filter</button>
          <Link href="/tailors" className="btn-secondary">Clear</Link>
        </div>
      </form>
      {businesses.length === 0 ? (
        <Empty title="No verified businesses match yet">Try another city or type.</Empty>
      ) : (
        <Directory
          center={center}
          kindLabels={BUSINESS_KINDS}
          entries={businesses.map((b) => ({
            id: b.id, slug: b.slug, name: b.name, city: b.city, lat: b.lat, lng: b.lng, kinds: b.kinds, rating: b.rating, reviewCount: b.reviewCount,
            completedOrders: b.completedOrders, styles: b._count.styles, fabrics: b._count.materials, isDemo: b.isDemo, photo: b.photos[0]?.url ?? null,
          }))}
        />
      )}
    </div>
  );
}
