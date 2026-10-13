import Link from "next/link";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, OrderStatusBadge, PageHeader, Section, VerificationBadge } from "@/components/ui/basics";
import { requireActor } from "@/server/auth";
import { isAdmin } from "@/server/authz";
import { OPEN_STATUSES } from "@/server/order-machine";
import { resendVerificationAction } from "../actions/auth";

export const metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const actor = await requireActor();
  const { welcome } = await searchParams;
  const [orders, notifications, toConfirm] = await Promise.all([
    db.order.findMany({ where: { customerId: actor.userId, status: { in: OPEN_STATUSES } }, orderBy: { updatedAt: "desc" }, take: 5, include: { style: true, fabricListing: true } }),
    db.notification.findMany({ where: { userId: actor.userId }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.measurementRecord.count({ where: { profile: { ownerId: actor.userId }, status: "SUBMITTED", source: "PROFESSIONAL" } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title={welcome ? `Welcome, ${actor.name.split(" ")[0]}!` : `Hello, ${actor.name.split(" ")[0]}`} actions={<Link href="/order/new" className="btn-primary">New outfit</Link>} />

      {!actor.emailVerified && (
        <ActionForm action={resendVerificationAction} className="card flex flex-wrap items-center justify-between gap-3 border-gold-400 bg-gold-100/40">
          <p className="text-sm">Please confirm your email address ({actor.email}) using the link we sent you.</p>
          <SubmitButton className="btn-secondary">Send the link again</SubmitButton>
        </ActionForm>
      )}
      {toConfirm > 0 && <p className="card text-sm">A professional took your measurements. <Link href="/measurements" className="text-brand-700 underline">Check and confirm them</Link>.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Orders in progress" actions={<Link href="/orders" className="text-sm text-brand-700 hover:underline">All orders</Link>}>
          {orders.length === 0 ? <p className="text-sm text-stone-600">Nothing in progress. <Link href="/styles" className="text-brand-700 underline">Browse styles</Link></p> : (
            <ul className="space-y-2">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link href={`/orders/${o.id}`} className="flex items-center justify-between gap-2 rounded-lg p-2 hover:bg-stone-50">
                    <span className="min-w-0 truncate text-sm font-medium">#{o.number} {o.kind === "FABRIC" ? o.fabricListing?.name : o.style?.name}</span>
                    <OrderStatusBadge status={o.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Latest updates" actions={<Link href="/notifications" className="text-sm text-brand-700 hover:underline">All</Link>}>
          {notifications.length === 0 ? <p className="text-sm text-stone-600">No updates yet.</p> : (
            <ul className="space-y-2 text-sm">
              {notifications.map((n) => (
                <li key={n.id} className={n.read ? "text-stone-600" : "font-medium"}>
                  {n.link ? <Link href={n.link} className="hover:text-brand-700">{n.message}</Link> : n.message}
                  <span className="block text-xs font-normal text-stone-500">{formatDateTime(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/measurements" className="card hover:border-brand-500"><p className="font-semibold">📏 Measurements</p><p className="text-sm text-stone-600">Save measurements for you and your family.</p></Link>
        <Link href="/support" className="card hover:border-brand-500"><p className="font-semibold">🤝 Help & disputes</p><p className="text-sm text-stone-600">Ask a question or follow up a problem.</p></Link>
        <Link href="/settings" className="card hover:border-brand-500"><p className="font-semibold">⚙️ Settings</p><p className="text-sm text-stone-600">Profile, password, addresses, privacy.</p></Link>
      </div>

      <Section title="Work with us">
        <ul className="space-y-3">
          {actor.memberships.map((m) => (
            <li key={m.businessId} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm"><strong>{m.businessName}</strong> · {m.role.toLowerCase()} <VerificationBadge status={m.verificationStatus} /></span>
              <Link href={`/biz/${m.businessId}`} className="btn-secondary">Open business portal</Link>
            </li>
          ))}
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">Are you a tailor, seamstress or fabric seller?</span>
            <Link href="/biz/new" className="btn-secondary">Register a business</Link>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">
              Measure customers or deliver orders{actor.agents.map((a) => <span key={a.kind} className="ml-2"><Badge>{a.kind === "RIDER" ? "Rider" : "Measurer"}</Badge> <VerificationBadge status={a.verificationStatus} /></span>)}
            </span>
            <Link href="/pro" className="btn-secondary">{actor.agents.length ? "Work dashboard" : "Apply"}</Link>
          </li>
          {isAdmin(actor) && <li className="flex justify-end"><Link href="/admin" className="btn-secondary">Admin portal</Link></li>}
        </ul>
      </Section>
    </div>
  );
}
