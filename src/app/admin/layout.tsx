import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { SubNav } from "@/components/ui/sub-nav";
import type { AdminPermission } from "@/lib/enums";
import { requireActor } from "@/server/auth";
import { isAdmin } from "@/server/authz";
import { adminQueues } from "@/server/queries/admin";

export const metadata = { title: { default: "Admin", template: "%s · Admin" } };

const SECTIONS: { href: string; label: string; perm: AdminPermission; exact?: boolean; count?: "verifications" | "disputes" | "tickets" | "reviewReports" | "pendingStyles" }[] = [
  { href: "/admin", label: "Overview", perm: "AUDIT", exact: true },
  { href: "/admin/verifications", label: "Verifications", perm: "VERIFY", count: "verifications" },
  { href: "/admin/users", label: "Users", perm: "USERS" },
  { href: "/admin/orders", label: "Orders", perm: "ORDERS" },
  { href: "/admin/disputes", label: "Disputes", perm: "DISPUTES", count: "disputes" },
  { href: "/admin/reviews", label: "Reviews", perm: "DISPUTES", count: "reviewReports" },
  { href: "/admin/support", label: "Support", perm: "DISPUTES", count: "tickets" },
  { href: "/admin/finance", label: "Finance", perm: "FINANCE" },
  { href: "/admin/catalogue", label: "Catalogue", perm: "CATALOGUE", count: "pendingStyles" },
  { href: "/admin/settings", label: "Settings & templates", perm: "CONFIG" },
  { href: "/admin/audit", label: "Audit log", perm: "AUDIT" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  if (!isAdmin(actor)) notFound();
  const visible = SECTIONS.filter((s) => isAdmin(actor, s.perm));
  const queues = await adminQueues();
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Administration</p>
      {visible.length === 0 ? (
        <p className="card text-sm text-stone-700">Your administrator account has no permissions yet. Ask a super administrator to grant them.</p>
      ) : (
        <SubNav items={visible.map((s) => ({ href: s.href, label: s.label, exact: s.exact, count: s.count ? queues[s.count] : undefined }))} />
      )}
      {children}
    </div>
  );
}
