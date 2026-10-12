import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, PageHeader, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { formatDateTime } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { closeTicketAction, replyTicketAction } from "../../actions/account";

export const metadata = { title: "Support request" };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  const t = await db.supportTicket.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  // Only the person who opened it; staff answer from the admin area.
  if (!t || t.userId !== actor.userId) notFound();
  const order = t.orderId ? await db.order.findFirst({ where: { id: t.orderId, customerId: actor.userId }, select: { id: true, number: true } }) : null;
  const closed = t.status === "CLOSED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={t.subject}
        subtitle={order ? <Link href={`/orders/${order.id}`} className="text-brand-700 underline">About order #{order.number}</Link> : undefined}
        back={{ href: "/support", label: "Help" }}
        actions={<Badge tone={closed ? "grey" : t.status === "ANSWERED" ? "green" : "gold"}>{closed ? "Closed" : t.status === "ANSWERED" ? "We replied" : "Waiting for our team"}</Badge>}
      />
      {sp.created && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Thanks — we've received your message. We'll reply here and notify you.</p>}

      <ol className="space-y-3">
        {t.messages.map((m) => (
          <li key={m.id} className={`rounded-xl border p-3 ${m.fromStaff ? "border-brand-100 bg-brand-50" : "border-stone-200 bg-white"}`}>
            <p className="text-xs font-semibold text-stone-600">{m.fromStaff ? `${BRAND.name} support` : "You"} · {formatDateTime(m.createdAt)}</p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-900">{m.body}</p>
          </li>
        ))}
      </ol>

      {closed ? (
        <p className="text-sm text-stone-600">This request is closed. <Link href="/support" className="font-semibold text-brand-700 underline">Open a new one</Link> if you need more help.</p>
      ) : (
        <Section title="Reply">
          <ActionForm action={replyTicketAction} resetOnSuccess className="space-y-3">
            <input type="hidden" name="ticketId" value={t.id} />
            <div>
              <label className="label" htmlFor="body">Your message</label>
              <textarea id="body" name="body" required maxLength={3000} rows={4} className="input" />
            </div>
            <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Send reply</SubmitButton>
          </ActionForm>
          <ActionForm action={closeTicketAction} className="space-y-2 border-t border-stone-100 pt-4">
            <input type="hidden" name="ticketId" value={t.id} />
            <p className="text-sm text-stone-600">All sorted? Close this request.</p>
            <ConfirmButton className="btn-secondary min-h-11 w-full sm:w-auto">Close request</ConfirmButton>
          </ActionForm>
        </Section>
      )}
    </div>
  );
}
