import type { Metadata } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { logout } from "./actions/auth";

export const metadata: Metadata = {
  title: "TailorConnect Ghana",
  description: "Find a tailor or seamstress near you, choose your style and fabric, and get it sewn and delivered.",
};

const NAV: Record<Role, { href: string; label: string }[]> = {
  CLIENT: [
    { href: "/order/new", label: "New outfit" },
    { href: "/fabrics", label: "Buy fabric" },
    { href: "/tailors", label: "Tailors near me" },
    { href: "/orders", label: "My orders" },
  ],
  BUSINESS: [{ href: "/business", label: "My portal" }],
  MEASURER: [{ href: "/measurer", label: "Measurement jobs" }],
  RIDER: [{ href: "/rider", label: "Deliveries" }],
  ADMIN: [{ href: "/admin", label: "Verifications" }],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const role = user?.role as Role | undefined;

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-700">
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-gold-400 text-base">🧵</span>
              TailorConnect
            </Link>
            {role && (
              <nav className="flex flex-wrap gap-4 text-sm font-medium text-stone-600">
                {NAV[role].map((n) => (
                  <Link key={n.href} href={n.href} className="hover:text-brand-700">
                    {n.label}
                  </Link>
                ))}
              </nav>
            )}
            <div className="ml-auto flex items-center gap-3 text-sm">
              {user ? (
                <>
                  <span className="hidden text-stone-500 sm:inline">
                    {user.name} · {ROLE_LABELS[role!]}
                  </span>
                  <form action={logout}>
                    <button className="btn-secondary py-1.5">Log out</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="font-medium text-stone-700 hover:text-brand-700">Log in</Link>
                  <Link href="/signup" className="btn-primary py-1.5">Sign up</Link>
                </>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
