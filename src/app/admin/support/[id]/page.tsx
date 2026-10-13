import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, PageHeader, Section } from "@/components/ui/basics";
import { adminCloseTicketAction, adminReplyTicketAction } from "@/app/actions/admin";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { isAdmin } from "@/server/authz";
import { userNames } from "@/server/queries/admin";
import { requireAdminPage } from "../../_lib/guard";

export const metadata = { title: "Support request" };
const STATUS: Record<string, string> = { OPEN: "Waiting for us", ANSWERED: "Answered", CLOSED: "Closed" };

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("DISPUTES");
  const { id } = await params;
  const t = await db.supportTicket.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, email: true } }, messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!t) notFound();
  const [names, order] = await Promise.all([
    userNames(t.messages.map((m) => m.authorId)),
    t.orderId ? db.order.findUnique({ where: { id: t.orderId }, select: { id: true, number: true } }) : null,
  ]);
  const closed = t.status === "CLOSED";

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/support", label: "Support requests" }}
        title={t.subject}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          {isAdmin(actor, "USERS") ? <Link href={`/admin/users/${t.user.id}`} className="text-brand-700 hover:underline">{t.user.name}</Link> : t.user.name}
          <span className="break-all">· {t.user.email}</span>
          {order && <> · {isAdmin(actor, "ORDERS") ? <Link href={`/admin/orders/${order.id}`} className="text-brand-700 hover:underline">order #{order.number}</Link> : `order #${order.number}`}</>}
          <Badge tone={t.status === "OPEN" ? "gold" : t.status === "ANSWERED" ? "green" : "grey"}>{STATUS[t.status] ?? t.status}</Badge>
        </span>}
      />
      <Section title="Conversation">
        <ol className="space-y-3">
          {t.messages.map((m) => (
            <li key={m.id} className={`rounded-lg border p-3 text-sm ${m.fromStaff ? "border-brand-100 bg-brand-50" : "border-stone-200"}`}>
              <p className="text-xs text-stone-600"><span className="font-semibold text-stone-800">{m.fromStaff ? `${names.get(m.authorId)?.name ?? "Staff"} (team)` : t.user.name}</span> · {formatDateTime(m.createdAt)}</p>
              <p className="mt-1 whitespace-pre-line break-words">{m.body}</p>
            </li>
          ))}
        </ol>
      </Section>
      {closed ? (
        <p className="card text-sm text-stone-600">This request is closed. The person can open a new one if they need more help.</p>
      ) : (
        <>
          <Section title="Reply">
            <ActionForm action={adminReplyTicketAction} resetOnSuccess className="space-y-3">
              <input type="hidden" name="ticketId" value={t.id} />
              <div>
                <label className="label" htmlFor="body">Your reply (the person is notified)</label>
                <textarea id="body" name="body" rows={4} required maxLength={3000} className="input" />
              </div>
              <SubmitButton>Send reply</SubmitButton>
            </ActionForm>
          </Section>
          <ActionForm action={adminCloseTicketAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="ticketId" value={t.id} />
            <ConfirmButton className="btn-secondary" confirmText="Tap again to close">Close request</ConfirmButton>
          </ActionForm>
        </>
      )}
    </div>
  );
}
