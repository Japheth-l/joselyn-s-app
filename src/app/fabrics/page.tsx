import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CITIES, FABRIC_DESIGNS } from "@/lib/constants";
import { distanceKm, formatCedis } from "@/lib/geo";
import { Swatch } from "@/components/swatch";

export default async function FabricsPage({ searchParams }: { searchParams: Promise<{ design?: string }> }) {
  const user = await requireUser("CLIENT");
  const { design } = await searchParams;
  const here = user.lat != null && user.lng != null ? { lat: user.lat, lng: user.lng } : CITIES.Accra;

  const materials = await db.material.findMany({
    where: {
      yardsInStock: { gt: 0 },
      business: { verificationStatus: "VERIFIED" },
      ...(design && design in FABRIC_DESIGNS ? { design } : {}),
    },
    include: { business: true },
  });
  const sorted = materials
    .map((m) => ({ ...m, km: distanceKm(here.lat, here.lng, m.business.lat, m.business.lng) }))
    .sort((a, b) => a.km - b.km);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Buy fabric</h1>
        <p className="text-stone-600">From verified tailors and shops, nearest first.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <FilterLink href="/fabrics" active={!design}>All</FilterLink>
        {Object.entries(FABRIC_DESIGNS).map(([k, d]) => (
          <FilterLink key={k} href={`/fabrics?design=${k}`} active={design === k}>{d.label}</FilterLink>
        ))}
      </div>
      {sorted.length === 0 ? (
        <p className="card">No fabric of this kind in stock right now.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((m) => (
            <Link key={m.id} href={`/fabrics/${m.id}`} className="card hover:border-brand-500">
              <Swatch design={m.design} color={m.color} className="mb-3 h-28" />
              <p className="font-semibold">{m.name}</p>
              <p className="text-sm text-stone-500">{m.business.name} · {m.km.toFixed(1)} km</p>
              <p className="mt-2 flex justify-between text-sm">
                <span className="font-semibold">{formatCedis(m.pricePerYard)} / yard</span>
                <span className="text-stone-500">{m.yardsInStock} yards left</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-full border px-3 py-1 ${active ? "border-brand-600 bg-brand-600 text-white" : "border-stone-300 bg-white"}`}>
      {children}
    </Link>
  );
}
