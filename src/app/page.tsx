import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { ROLE_HOME, type Role } from "@/lib/constants";

const STEPS = [
  { icon: "👗", title: "Pick a style", text: "Kaba and slit, shirts, smocks, suits, wedding gowns and more." },
  { icon: "🎨", title: "Choose your fabric", text: "Kente, wax print, lace, batik, or bring your own cloth." },
  { icon: "📍", title: "Find a tailor nearby", text: "We recommend verified tailors close to you that fit your budget." },
  { icon: "📏", title: "Get measured", text: "Enter your measurements, visit the shop, or have an agent come to you." },
  { icon: "🛵", title: "Delivered to you", text: "Pick it up yourself or have a rider bring it to your door." },
];

const ROLES = [
  { role: "BUSINESS", title: "Tailors & sewing companies", text: "Get verified, show your fabric stock and prices, and receive orders from clients near you." },
  { role: "MEASURER", title: "Measurement agents", text: "Visit clients at home, take their measurements and send them straight to the tailor." },
  { role: "RIDER", title: "Delivery riders", text: "Deliver finished outfits and fabric to clients and earn per trip." },
];

export default async function Home() {
  const user = await currentUser();
  if (user) redirect(ROLE_HOME[user.role as Role]);

  return (
    <div className="space-y-16">
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div>
          <p className="mb-3 inline-block rounded-full bg-gold-100 px-3 py-1 text-sm font-semibold text-gold-500">
            Made for Ghana 🇬🇭
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">
            Your outfit, sewn by a trusted tailor near you.
          </h1>
          <p className="mt-4 text-lg text-stone-600">
            Choose a style and fabric, tell us your budget, and we connect you with verified tailors and
            seamstresses close by, with measurement at home and delivery to your door.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/signup?role=CLIENT" className="btn-primary px-6 py-3 text-base">Get started</Link>
            <Link href="/signup?role=BUSINESS" className="btn-secondary px-6 py-3 text-base">I&apos;m a tailor</Link>
          </div>
        </div>
        <div className="kente-band grid aspect-[4/3] place-items-center rounded-2xl text-8xl shadow-inner" aria-hidden>
          <span className="rounded-2xl bg-white/90 p-6 shadow">🪡</span>
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">How it works</h2>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card">
              <div className="text-3xl">{s.icon}</div>
              <p className="mt-2 text-xs font-semibold uppercase text-stone-400">Step {i + 1}</p>
              <h3 className="font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-bold">Work with TailorConnect</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {ROLES.map((r) => (
            <div key={r.role} className="card flex flex-col">
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-1 flex-1 text-sm text-stone-600">{r.text}</p>
              <Link href={`/signup?role=${r.role}`} className="btn-secondary mt-4 self-start">Join</Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
