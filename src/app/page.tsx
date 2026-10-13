import Link from "next/link";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { formatMoney } from "@/lib/money";
import { StyleImage, Swatch } from "@/components/swatch";
import { LogoMark } from "@/components/logo";
import { currentActor } from "@/server/auth";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: "👗", title: "Choose a style", text: "Pick from the catalogue, choose the details, and add photos of what you have in mind." },
  { icon: "📍", title: "Compare tailors near you", text: "See verified tailors who sew it, with price estimates against your budget and realistic finish dates." },
  { icon: "📏", title: "Get measured", text: "Use saved measurements, enter your own, visit the workshop, or have a professional come to you." },
  { icon: "🛵", title: "Pick up or get it delivered", text: "Track every step. Pay by Mobile Money or card, and confirm handover with a one-time code." },
];

export default async function Home() {
  const [actor, categories, styles, fabrics] = await Promise.all([
    currentActor(),
    db.garmentCategory.findMany({ where: { isActive: true, styles: { some: { status: "PUBLISHED" } } }, orderBy: { sortOrder: "asc" }, include: { _count: { select: { styles: { where: { status: "PUBLISHED" } } } } } }),
    db.style.findMany({ where: { status: "PUBLISHED" }, orderBy: { createdAt: "asc" }, take: 8 }),
    db.fabricListing.findMany({ where: { status: "ACTIVE", business: { verificationStatus: "VERIFIED" } }, orderBy: { updatedAt: "desc" }, take: 6, include: { business: { select: { name: true } } } }),
  ]);

  return (
    <div className="space-y-12">
      <section className="overflow-hidden rounded-2xl bg-brand-700 px-5 py-10 text-white sm:px-10 sm:py-14">
        <div className="max-w-2xl space-y-5">
          <p className="flex items-center gap-2 text-sm font-medium text-gold-400"><LogoMark className="h-6 w-6" /> {BRAND.meaning}</p>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">{BRAND.tagline}</h1>
          <p className="text-brand-100">Choose your style and fabric, compare verified tailors and seamstresses nearby, and follow your outfit from measurements to your door.</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/order/new" className="btn bg-gold-400 text-stone-900 hover:bg-gold-500">Start an outfit</Link>
            <Link href="/styles" className="btn border border-white/40 text-white hover:bg-white/10">Browse styles</Link>
            {!actor && <Link href="/biz/new" className="btn text-white underline-offset-4 hover:underline">Are you a tailor?</Link>}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-bold">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card space-y-2">
              <p className="text-2xl" aria-hidden>{s.icon}</p>
              <p className="font-semibold">{i + 1}. {s.title}</p>
              <p className="text-sm text-stone-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {categories.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-2">
            <h2 className="text-xl font-bold">What would you like sewn?</h2>
            <Link href="/styles" className="text-sm font-medium text-brand-700 hover:underline">All styles →</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <Link key={c.id} href={`/styles?category=${c.slug}`} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:border-brand-500">
                {c.name} <span className="text-stone-500">({c._count.styles})</span>
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {styles.map((s) => (
              <Link key={s.id} href={`/styles/${s.slug}`} className="card space-y-2 p-3 hover:border-brand-500">
                <StyleImage icon={s.icon} imageUrl={s.imageUrl} className="aspect-square w-full" />
                <p className="truncate text-sm font-semibold">{s.name}</p>
                <p className="text-xs text-stone-500">{s.indicativeLabourMinor ? `Sewing from about ${formatMoney(s.indicativeLabourMinor)}` : "Price on request"}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {fabrics.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between gap-2">
            <h2 className="text-xl font-bold">Fabric from local sellers</h2>
            <Link href="/fabrics" className="text-sm font-medium text-brand-700 hover:underline">All fabrics →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {fabrics.map((f) => (
              <Link key={f.id} href={`/fabrics/${f.id}`} className="card space-y-2 p-3 hover:border-brand-500">
                <Swatch design={f.fabricType} color={f.color} imageUrl={f.photos[0]} className="aspect-square w-full" />
                <p className="truncate text-sm font-semibold">{f.name}</p>
                <p className="truncate text-xs text-stone-500">{f.business.name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card space-y-1"><p className="font-semibold">✓ Verified businesses</p><p className="text-sm text-stone-600">Every tailor and seller is checked by our team before customers can see them.</p></div>
        <div className="card space-y-1"><p className="font-semibold">🔒 Safe payments</p><p className="text-sm text-stone-600">Pay by Mobile Money or card through a licensed provider. We never see or store your PIN or card number.</p></div>
        <div className="card space-y-1"><p className="font-semibold">🤝 Help when it goes wrong</p><p className="text-sm text-stone-600">Raise a dispute from your order and our team will review it. <Link href="/policies/refunds" className="text-brand-700 underline">Our policy</Link>.</p></div>
      </section>
    </div>
  );
}
