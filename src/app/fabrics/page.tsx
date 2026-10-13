import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { CITIES, FABRIC_TYPES, labelOf } from "@/lib/enums";
import { Swatch } from "@/components/swatch";
import { DemoBadge, Empty, PageHeader } from "@/components/ui/basics";

export const metadata = { title: "Fabrics" };
export const dynamic = "force-dynamic";

type SP = { type?: string; city?: string; q?: string; max?: string };

export default async function FabricsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const max = sp.max ? Math.round(Number(sp.max) * 100) : null;
  const where: Prisma.FabricListingWhereInput = {
    status: "ACTIVE",
    business: { verificationStatus: "VERIFIED", ...(sp.city && sp.city in CITIES ? { city: sp.city } : {}) },
    ...(sp.type && sp.type in FABRIC_TYPES ? { fabricType: sp.type } : {}),
    ...(max && max > 0 ? { pricePerUnitMinor: { lte: max } } : {}),
    ...(sp.q ? { OR: [{ name: { contains: sp.q, mode: "insensitive" } }, { colorName: { contains: sp.q, mode: "insensitive" } }, { pattern: { contains: sp.q, mode: "insensitive" } }] } : {}),
  };
  const listings = await db.fabricListing.findMany({ where, orderBy: { updatedAt: "desc" }, take: 120, include: { business: { select: { name: true, city: true, isDemo: true } } } });

  return (
    <div>
      <PageHeader title="Fabrics" subtitle="Buy fabric from verified sellers. Have it delivered to you or straight to your tailor." />
      <form className="card mb-6 grid gap-3 sm:grid-cols-5" role="search">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="colour, pattern, name" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={sp.type ?? ""} className="input">
            <option value="">All</option>
            {Object.entries(FABRIC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="city">City</label>
          <select id="city" name="city" defaultValue={sp.city ?? ""} className="input">
            <option value="">Anywhere</option>
            {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="max">Max price per unit (GH₵)</label>
          <input id="max" name="max" inputMode="decimal" defaultValue={sp.max} className="input" />
        </div>
        <div className="flex gap-2 sm:col-span-5">
          <button className="btn-primary">Filter</button>
          <Link href="/fabrics" className="btn-secondary">Clear</Link>
        </div>
      </form>
      {listings.length === 0 ? (
        <Empty title="No fabrics match">Try fewer filters.</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((f) => {
            const available = f.qtyOnHandCenti - f.qtyReservedCenti;
            return (
              <li key={f.id}>
                <Link href={`/fabrics/${f.id}`} className="card flex h-full flex-col gap-2 p-3 hover:border-brand-500">
                  <Swatch design={f.fabricType} color={f.color} imageUrl={f.photos[0]} className="aspect-square w-full" />
                  <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{labelOf(FABRIC_TYPES, f.fabricType)}</p>
                  <p className="font-semibold leading-snug">{f.name}</p>
                  <p className="text-sm">{formatMoney(f.pricePerUnitMinor)} <span className="text-stone-500">per {f.unit === "METRE" ? "metre" : "yard"}</span></p>
                  <p className="mt-auto text-xs text-stone-500">
                    {available > 0 ? `${formatQty(available, f.unit)} available` : "Out of stock"} · {f.business.name}, {f.business.city}
                  </p>
                  <DemoBadge show={f.business.isDemo} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
