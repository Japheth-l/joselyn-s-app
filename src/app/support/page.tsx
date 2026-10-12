import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, PageHeader, Section, type Tone } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { DISPUTE_CATEGORIES, DISPUTE_STATUS, labelOf } from "@/lib/enums";
import { formatDate } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { openTicketAction } from "../actions/account";
import { disputeTone } from "./labels";

export const metadata = { title: "Help" };

const TICKET_STATUS: Record<string, [string, Tone]> = { OPEN: ["Waiting for our team", "gold"], ANSWERED: ["We replied", "green"], CLOSED: ["Closed", "grey"] };

export default async function SupportPage() {
  const actor = await requireActor();
  const businessIds = actor.memberships.map((m) => m.businessId);
  const [orders, tickets, disputes] = await Promise.all([
    db.order.findMany({
      where: { customerId: actor.userId, status: { not: "DRAFT" } },
      select: { id: true, number: true, style: { select: { name: true } }, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.supportTicket.findMany({ where: { userId: actor.userId }, orderBy: { updatedAt: "desc" }, take: 50 }),
    db.dispute.findMany({
      where: {
        OR: [
          { raisedById: actor.userId },
          { order: { customerId: actor.userId } },
          ...(businessIds.length ? [{ order: { businessId: { in: businessIds } } }] : []),
        ],
      },
      select: { id: true, number: true, category: true, status: true, createdAt: true, order: { select: { number: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Help" subtitle={<>Ask our team a question, or follow a dispute. Read our <Link href="/policies/refunds" className="font-semibold text-brand-700 underline">cancellations, refunds and disputes policy</Link>.</>} />

      <div className="card space-y-1 text-sm text-stone-700">
        <p className="font-semibold">Problem with an order?</p>
        <p>To raise a dispute (wrong measurements, missed deadline, damaged item…), open the order and choose “Report a problem”. For anything else, send us a message below.</p>
      </div>

      <Section title="Contact us">
        <ActionForm action={openTicketAction} className="space-y-4">
          <div>
            <label className="label" htmlFor="subject">Subject</label>
            <input id="subject" name="subject" required minLength={3} maxLength={120} className="input min-h-11" placeholder="e.g. Can't pay with Mobile Money" />
          </div>
          {orders.length > 0 && (
            <div>
              <label className="label" htmlFor="orderId">About an order? (optional)</label>
              <select id="orderId" name="orderId" defaultValue="" className="input min-h-11">
                <option value="">Not about an order</option>
                {orders.map((o) => <option key={o.id} value={o.id}>#{o.number} · {o.style?.name ?? "Fabric"} · {formatDate(o.createdAt)}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="label" htmlFor="body">How can we help?</label>
            <textarea id="body" name="body" required minLength={5} maxLength={3000} rows={5} className="input" />
          </div>
          <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Send</SubmitButton>
          <p className="text-xs text-stone-500">You can also email {BRAND.supportEmail}.</p>
        </ActionForm>
      </Section>

      <Section title="My requests">
        {tickets.length === 0 ? (
          <p className="text-sm text-stone-600">You haven't contacted us yet.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {tickets.map((t) => {
              const [label, tone] = TICKET_STATUS[t.status] ?? [t.status, "grey" as Tone];
              return (
                <li key={t.id}>
                  <Link href={`/support/${t.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-stone-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.subject}</span>
                      <span className="block text-xs text-stone-500">Updated {formatDate(t.updatedAt)}</span>
                    </span>
                    <Badge tone={tone}>{label}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Disputes">
        {disputes.length === 0 ? (
          <p className="text-sm text-stone-600">No disputes.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {disputes.map((d) => (
              <li key={d.id}>
                <Link href={`/support/disputes/${d.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:bg-stone-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">Dispute #{d.number} · {labelOf(DISPUTE_CATEGORIES, d.category)}</span>
                    <span className="block text-xs text-stone-500">Order #{d.order.number} · {formatDate(d.createdAt)}</span>
                  </span>
                  <Badge tone={disputeTone(d.status)}>{labelOf(DISPUTE_STATUS, d.status)}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
