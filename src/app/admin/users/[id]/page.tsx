import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, Dl, OrderStatusBadge, PageHeader, Section, VerificationBadge } from "@/components/ui/basics";
import { setAdminPermissionsAction, setUserStatusAction } from "@/app/actions/admin";
import { ADMIN_PERMISSIONS, MEMBERSHIP_ROLES, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time";
import { isAdmin } from "@/server/authz";
import { requireAdminPage } from "../../_lib/guard";
import { SubjectStatusForm } from "../../_lib/subject-status";

export const metadata = { title: "User" };

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("USERS");
  const { id } = await params;
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, phone: true, city: true, status: true, isDemo: true, createdAt: true, emailVerifiedAt: true,
      roles: { select: { role: true, permissions: true, createdAt: true } },
      memberships: { select: { role: true, business: { select: { id: true, name: true, verificationStatus: true, isDemo: true } } } },
      agentProfiles: { select: { id: true, kind: true, verificationStatus: true, available: true, serviceRadiusKm: true, createdAt: true } },
      _count: { select: { customerOrders: true, supportTickets: true, disputesRaised: true, reviews: true } },
    },
  });
  if (!user) notFound();
  const orders = await db.order.findMany({
    where: { customerId: user.id }, orderBy: { createdAt: "desc" }, take: 50,
    select: { id: true, number: true, status: true, totalMinor: true, createdAt: true, isDemo: true, business: { select: { name: true } } },
  });
  const adminRole = user.roles.find((r) => r.role === "ADMIN");
  const self = user.id === actor.userId;
  const canOrders = isAdmin(actor, "ORDERS");
  const canVerify = isAdmin(actor, "VERIFY");
  const deleted = user.status === "DELETED";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/users", label: "Users" }}
        title={user.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">Joined {formatDate(user.createdAt)} <Badge tone={user.status === "ACTIVE" ? "green" : "red"}>{user.status.toLowerCase()}</Badge><DemoBadge show={user.isDemo} /></span>}
      />

      <Section title="Profile">
        <Dl items={[
          ["Email", <span key="e" className="break-all">{user.email} {user.emailVerifiedAt ? "(confirmed)" : "(not confirmed)"}</span>],
          ["Phone", user.phone || "—"],
          ["City", user.city ?? "—"],
          ["Roles", user.roles.map((r) => r.role.toLowerCase()).join(", ") || "—"],
          ["Orders placed", user._count.customerOrders],
          ["Support requests / disputes raised / reviews", `${user._count.supportTickets} / ${user._count.disputesRaised} / ${user._count.reviews}`],
        ]} />
      </Section>

      <Section title="Businesses">
        {user.memberships.length ? (
          <ul className="space-y-2 text-sm">
            {user.memberships.map((m) => (
              <li key={m.business.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{m.business.name}</span>
                <span className="text-stone-600">{labelOf(MEMBERSHIP_ROLES, m.role)}</span>
                <VerificationBadge status={m.business.verificationStatus} />
                <DemoBadge show={m.business.isDemo} />
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-stone-500">Not a member of any business.</p>}
        {canVerify && user.memberships.filter((m) => m.role === "OWNER").map((m) => (
          <SubjectStatusForm key={m.business.id} subjectType="BUSINESS" subjectId={m.business.id} status={m.business.verificationStatus} name={m.business.name} />
        ))}
      </Section>

      <Section title="Professional profiles">
        {user.agentProfiles.length ? (
          <div className="space-y-3">
            {user.agentProfiles.map((p) => (
              <div key={p.id} className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">{p.kind === "MEASURER" ? "Measurement professional" : "Delivery rider"}</span> · since {formatDate(p.createdAt)} · {p.available ? "available" : "not taking jobs"} · {p.serviceRadiusKm} km
                </p>
                {canVerify ? (
                  <SubjectStatusForm subjectType={p.kind as "MEASURER" | "RIDER"} subjectId={user.id} status={p.verificationStatus} name={p.kind === "MEASURER" ? "Measurement profile" : "Rider profile"} />
                ) : <VerificationBadge status={p.verificationStatus} />}
              </div>
            ))}
            {canVerify && <p className="text-xs text-stone-500">Identity details are shown only on the verification page.</p>}
          </div>
        ) : <p className="text-sm text-stone-500">None.</p>}
      </Section>

      <Section title={`Orders as customer (${user._count.customerOrders})`}>
        {orders.length ? (
          <ul className="divide-y divide-stone-100 text-sm">
            {orders.map((o) => {
              const body = (
                <>
                  <span className="min-w-0">
                    <span className="font-medium">#{o.number}</span> <span className="text-stone-600">{o.business?.name ?? "No business yet"} · {formatDate(o.createdAt)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2"><OrderStatusBadge status={o.status} /><DemoBadge show={o.isDemo} /><span className="font-semibold tabular-nums">{formatMoney(o.totalMinor)}</span></span>
                </>
              );
              return (
                <li key={o.id}>
                  {canOrders ? (
                    <Link href={`/admin/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-stone-50">{body}</Link>
                  ) : <div className="flex flex-wrap items-center justify-between gap-2 py-2">{body}</div>}
                </li>
              );
            })}
          </ul>
        ) : <p className="text-sm text-stone-500">No orders.</p>}
        {user._count.customerOrders > orders.length && <p className="text-xs text-stone-500">Showing the latest {orders.length}.</p>}
      </Section>

      <Section title="Account status">
        {self ? (
          <p className="text-sm text-stone-600">You can't change your own account status.</p>
        ) : deleted ? (
          <p className="text-sm text-stone-600">This account was deleted by its owner. Its personal details have been removed.</p>
        ) : (
          <ActionForm action={setUserStatusAction} resetOnSuccess className="space-y-3">
            <input type="hidden" name="userId" value={user.id} />
            <input type="hidden" name="status" value={user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
            <p className="text-sm text-stone-700">
              {user.status === "SUSPENDED" ? "This account is suspended and cannot sign in." : "Suspending signs the person out everywhere and stops them signing in. Their orders stay as they are."}
            </p>
            <div>
              <label className="label" htmlFor="reason">Reason (kept in the audit log)</label>
              <input id="reason" name="reason" required maxLength={500} className="input" />
            </div>
            <ConfirmButton className={user.status === "SUSPENDED" ? "btn-secondary" : "btn-danger"} confirmText={user.status === "SUSPENDED" ? "Tap again to reinstate" : "Tap again to suspend"}>
              {user.status === "SUSPENDED" ? "Reinstate account" : "Suspend account"}
            </ConfirmButton>
          </ActionForm>
        )}
      </Section>

      {isAdmin(actor, "SUPER") && (
        <Section title="Administrator permissions">
          {self ? (
            <p className="text-sm text-stone-600">You can't change your own permissions.</p>
          ) : (
            <ActionForm action={setAdminPermissionsAction} className="space-y-3">
              <input type="hidden" name="userId" value={user.id} />
              <p className="text-sm text-stone-700">
                {adminRole ? `Administrator since ${formatDateTime(adminRole.createdAt)}.` : "Not an administrator."} Untick everything to remove administrator access. Changes sign the person out.
              </p>
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="sr-only">Permissions</legend>
                {Object.entries(ADMIN_PERMISSIONS).map(([k, label]) => (
                  <label key={k} className="flex min-h-10 items-start gap-2 text-sm">
                    <input type="checkbox" name="permissions" value={k} defaultChecked={adminRole?.permissions.includes(k)} className="mt-0.5 h-4 w-4" />
                    <span><span className="font-medium">{k}</span> · {label}</span>
                  </label>
                ))}
              </fieldset>
              <ConfirmButton className="btn-primary" confirmText="Tap again to save permissions">Save permissions</ConfirmButton>
            </ActionForm>
          )}
        </Section>
      )}
    </div>
  );
}
