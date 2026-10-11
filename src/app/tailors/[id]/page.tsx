import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BUSINESS_KINDS } from "@/lib/constants";
import { formatCedis } from "@/lib/geo";
import { StyleImage, Swatch } from "@/components/swatch";
import { JobMap } from "@/components/job-map";

export default async function TailorProfile({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const b = await db.business.findFirst({
    where: { id, verificationStatus: "VERIFIED" },
    include: {
      photos: { orderBy: { createdAt: "desc" } },
      styles: { include: { style: true }, orderBy: { price: "asc" } },
      materials: { where: { yardsInStock: { gt: 0 } }, orderBy: { pricePerYard: "asc" } },
      reviews: { include: { client: true, order: { include: { style: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!b) notFound();
  const isClient = user.role === "CLIENT";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-stone-500">{BUSINESS_KINDS[b.kind as keyof typeof BUSINESS_KINDS]} · ✓ Verified</p>
          <h1 className="page-title">{b.name}</h1>
          <p className="text-stone-600">{b.address}, {b.city} · 📞 {b.phone}</p>
          <p className="mt-1">
            {b.reviewCount > 0
              ? <><span className="text-gold-500">★</span> <strong>{b.rating.toFixed(1)}</strong> <span className="text-stone-500">from {b.reviewCount} review{b.reviewCount > 1 ? "s" : ""}</span></>
              : <span className="text-sm text-stone-500">No reviews yet</span>}
          </p>
          {b.description && <p className="mt-3 max-w-2xl text-stone-700">{b.description}</p>}
        </div>
        {isClient && <Link href="/order/new" className="btn-primary">Order an outfit</Link>}
      </div>

      {b.photos.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Their work</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {b.photos.map((p) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || `Work by ${b.name}`} className="aspect-square w-full rounded-xl object-cover" />
                {p.caption && <figcaption className="mt-1 text-xs text-stone-600">{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Styles & sewing prices</h2>
          <ul className="space-y-2">
            {b.styles.map((s) => (
              <li key={s.id} className="card flex items-center gap-3 py-3">
                <StyleImage icon={s.style.icon} imageUrl={s.style.imageUrl} className="h-12 w-12 shrink-0 text-2xl" />
                <span className="flex-1 font-medium">{s.style.name}</span>
                <span className="text-sm text-stone-500">{s.daysToMake} days</span>
                <span className="font-semibold">{formatCedis(s.price)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-3 text-lg font-semibold">Location</h2>
          <JobMap pins={[{ id: b.id, lat: b.lat, lng: b.lng, label: b.name, sub: b.address, emoji: "🧵" }]} />
        </section>
      </div>

      {b.materials.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Fabric in stock</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {b.materials.map((m) => {
              const inner = (
                <>
                  <Swatch design={m.design} color={m.color} imageUrl={m.imageUrl} className="mb-2 h-24 w-full" />
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-stone-500">{formatCedis(m.pricePerYard)}/yard · {m.yardsInStock} yd left</p>
                </>
              );
              return isClient
                ? <Link key={m.id} href={`/fabrics/${m.id}`} className="card p-3 hover:border-brand-500">{inner}</Link>
                : <div key={m.id} className="card p-3">{inner}</div>;
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Reviews</h2>
        {b.reviews.length === 0 && <p className="text-sm text-stone-500">No reviews yet.</p>}
        <ul className="space-y-3">
          {b.reviews.map((r) => (
            <li key={r.id} className="card text-sm">
              <p>
                <span className="text-gold-500">{"★".repeat(r.rating)}</span><span className="text-stone-300">{"★".repeat(5 - r.rating)}</span>
                <span className="ml-2 font-medium">{r.client.name.split(" ")[0]}</span>
                <span className="text-stone-500"> · {r.order.style?.name} · {r.createdAt.toLocaleDateString("en-GH")}</span>
              </p>
              {r.comment && <p className="mt-1 text-stone-700">{r.comment}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
