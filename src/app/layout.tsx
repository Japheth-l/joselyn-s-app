import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { currentActor } from "@/server/auth";
import { isAdmin } from "@/server/authz";
import { logoutAction } from "./actions/auth";
import { RegisterServiceWorker } from "@/components/register-sw";
import { LogoMark } from "@/components/logo";

export const metadata: Metadata = {
  title: { default: BRAND.name, template: `%s · ${BRAND.name}` },
  description: "Find a verified tailor or seamstress near you, choose your style and fabric, and get it sewn and delivered.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#14382a", width: "device-width", initialScale: 1 };

const PUBLIC_NAV = [
  { href: "/styles", label: "Styles" },
  { href: "/fabrics", label: "Fabrics" },
  { href: "/tailors", label: "Tailors" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  const unread = actor ? await db.notification.count({ where: { userId: actor.userId, read: false } }) : 0;
  const sandbox = process.env.PAYMENTS_MODE === "sandbox";

  const menu: { href: string; label: string }[] = actor
    ? [
        { href: "/account", label: "My account" },
        { href: "/orders", label: "My orders" },
        { href: "/measurements", label: "Measurements" },
        { href: "/support", label: "Help & disputes" },
        { href: "/settings", label: "Settings" },
        ...actor.memberships.map((m) => ({ href: `/biz/${m.businessId}`, label: `🏪 ${m.businessName}` })),
        ...(actor.agents.length ? [{ href: "/pro", label: "🧰 Work dashboard" }] : []),
        ...(isAdmin(actor) ? [{ href: "/admin", label: "🛡️ Admin" }] : []),
      ]
    : [];

  return (
    <html lang="en-GH">
      <body className="flex min-h-screen flex-col overflow-x-hidden">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
        {sandbox && (
          <div role="note" className="bg-gold-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            Payments are in test mode: no real money moves, so an order shown as paid has not really been paid.
          </div>
        )}
        <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href="/" className="flex shrink-0 items-center gap-2 text-xl font-extrabold tracking-tight text-brand-700">
              <LogoMark className="h-8 w-8" />
              {BRAND.name}
            </Link>
            <nav aria-label="Main" className="hidden items-center gap-5 text-sm font-medium text-stone-600 md:flex">
              {PUBLIC_NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-brand-700">{n.label}</Link>)}
              {actor && <Link href="/orders" className="hover:text-brand-700">My orders</Link>}
            </nav>
            <div className="ml-auto flex items-center gap-2 text-sm">
              {actor ? (
                <>
                  <Link href="/order/new" className="btn-primary hidden px-3 py-1.5 sm:inline-flex">New outfit</Link>
                  <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-stone-100" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
                    <span aria-hidden>🔔</span>
                    {unread > 0 && <span className="absolute right-0 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-clay-500 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" className="px-2 font-medium text-stone-700 hover:text-brand-700">Log in</Link>
                  <Link href="/signup" className="btn-primary px-3 py-1.5">Sign up</Link>
                </>
              )}
              <details className="relative">
                <summary className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full hover:bg-stone-100 [&::-webkit-details-marker]:hidden" aria-label="Menu">
                  <span aria-hidden className="text-lg">☰</span>
                </summary>
                <div className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-stone-200 bg-white p-2 shadow-lg">
                  {actor && <p className="truncate px-3 py-2 text-xs text-stone-500">Signed in as {actor.name}</p>}
                  <ul className="text-sm">
                    {actor && <li><Link href="/order/new" className="block rounded-lg px-3 py-2 font-semibold text-brand-700 hover:bg-stone-100">+ New outfit</Link></li>}
                    {PUBLIC_NAV.map((n) => <li key={n.href}><Link href={n.href} className="block rounded-lg px-3 py-2 hover:bg-stone-100">{n.label}</Link></li>)}
                    {menu.length > 0 && <li className="my-1 border-t border-stone-100" aria-hidden />}
                    {menu.map((n) => <li key={n.href}><Link href={n.href} className="block truncate rounded-lg px-3 py-2 hover:bg-stone-100">{n.label}</Link></li>)}
                  </ul>
                  {actor && (
                    <form action={logoutAction} className="mt-1 border-t border-stone-100 pt-1">
                      <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100">Log out</button>
                    </form>
                  )}
                </div>
              </details>
            </div>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
        <footer className="border-t border-stone-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-stone-500">
            <span>© {new Date().getFullYear()} {BRAND.name} · {BRAND.meaning}</span>
            <Link href="/policies/terms" className="hover:text-stone-800">Terms</Link>
            <Link href="/policies/privacy" className="hover:text-stone-800">Privacy</Link>
            <Link href="/policies/refunds" className="hover:text-stone-800">Cancellations, refunds & disputes</Link>
            <Link href="/support" className="hover:text-stone-800">Help</Link>
          </div>
        </footer>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
