import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { logout } from "./actions/auth";
import { RegisterServiceWorker } from "@/components/register-sw";

export const metadata: Metadata = {
  title: "TailorConnect Ghana",
  description: "Find a tailor or seamstress near you, choose your style and fabric, and get it sewn and delivered.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "TailorConnect", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#0d7352", width: "device-width", initialScale: 1 };

const NAV: Record<Role, { href: string; label: string }[]> = {
  CLIENT: [
    { href: "/order/new", label: "New outfit" },
    { href: "/fabrics", label: "Buy fabric" },
    { href: "/tailors", label: "Tailors near me" },
    { href: "/orders", label: "My orders" },
  ],
  BUSINESS: [{ href: "/business", label: "My portal" }, { href: "/earnings", label: "Earnings" }],
  MEASURER: [{ href: "/measurer", label: "Measurement jobs" }, { href: "/earnings", label: "Earnings" }],
  RIDER: [{ href: "/rider", label: "Deliveries" }, { href: "/earnings", label: "Earnings" }],
  ADMIN: [
    { href: "/admin", label: "Verifications" },
    { href: "/admin/payouts", label: "Payouts" },
    { href: "/admin/styles", label: "Style catalogue" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const role = user?.role as Role | undefined;
  const unread = user ? await db.notification.count({ where: { userId: user.id, read: false } }) : 0;

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
                  <Link href="/notifications" className="relative text-xl" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
                    🔔
                    {unread > 0 && (
                      <span className="absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-clay-500 px-1 text-[10px] font-bold text-white">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </Link>
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
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
