import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, Dl, OrderStatusBadge, PageHeader, Section } from "@/components/ui/basics";
import { adminCancelOrderAction, adminRefundAction, reopenDeliveryAction } from "@/app/actions/admin";
import {
  APPOINTMENT_STATUS, DELIVERY_LEGS, DELIVERY_STATUS, DISPUTE_CATEGORIES, DISPUTE_STATUS, MEASUREMENT_METHODS, ORDER_STATUS,
  PAYMENT_STATUS, QUOTE_LINE_KINDS, labelOf,
} from "@/lib/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime } from "@/lib/time";
import { isAdmin } from "@/server/authz";
import { WORK_STARTED } from "@/server/order-machine";
import { userNames } from "@/server/queries/admin";
import { requireAdminPage } from "../../_lib/guard";
import { Table, Td } from "../../_lib/ui";

export const metadata = { title: "Order" };

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("ORDERS");
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true } },
      business: { select: { id: true, name: true, phone: true, city: true, verificationStatus: true } },
      style: { select: { name: true } },
      fabricListing: { select: { name: true, unit: true } },
      parentOrder: { select: { id: true, number: true } },
      fabricOrders: { select: { id: true, number: true, status: true } },
      quotations: { include: { business: { select: { name: true } }, lines: { orderBy: { sortOrder: "asc" } } }, orderBy: [{ createdAt: "asc" }] },
      payments: { orderBy: { createdAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
      deliveries: { include: { rider: { select: { name: true, phone: true } } }, orderBy: { createdAt: "asc" } },
      appointments: { include: { professional: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      disputes: { orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, category: true, createdAt: true } },
    },
  });
  if (!order) notFound();
  const ledger = await db.ledgerEntry.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
  const names = await userNames([...order.events.map((e) => e.actorId), ...order.refunds.map((r) => r.decidedById)]);

  const refundable = order.amountPaidMinor - order.amountRefundedMinor;
  const canCancel = !WORK_STARTED.includes(order.status as never) && !["CANCELLED", "REFUNDED", "DISPUTED"].includes(order.status);
  const canRefund = isAdmin(actor, "FINANCE") && refundable > 0;
  const activeDelivery = order.deliveries.some((d) => !["FAILED", "CANCELLED", "DELIVERED"].includes(d.status));
  const canReopen = order.status === "READY" && order.fulfilment === "DELIVERY" && !activeDelivery && order.deliveries.some((d) => ["FAILED", "CANCELLED"].includes(d.status));
  const canDisputes = isAdmin(actor, "DISPUTES");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/orders", label: "Orders" }}
        title={`Order #${order.number}`}
        subtitle={<span className="flex flex-wrap items-center gap-2"><OrderStatusBadge status={order.status} /><Badge>{labelOf(PAYMENT_STATUS, order.paymentStatus)}</Badge><DemoBadge show={order.isDemo} /> Created {formatDateTime(order.createdAt)}</span>}
      />

      <Section title="Summary">
        <Dl items={[
          ["Kind", order.kind === "FABRIC" ? "Fabric purchase" : "Custom garment"],
          ["Style", order.style?.name ?? "—"],
          ["Customer", <Link key="c" href={`/admin/users/${order.customer.id}`} className="text-brand-700 hover:underline">{order.customer.name}</Link>],
          ["Customer contact", <span key="cc" className="break-all">{order.customer.email}{order.customer.phone ? ` · ${order.customer.phone}` : ""}</span>],
          ["Business", order.business ? `${order.business.name} (${order.business.city}) · ${order.business.phone}` : "Not chosen yet"],
          ["Fabric", order.fabricSource === "OWN" ? "Customer's own" : order.fabricListing ? `${order.fabricListing.name}` : order.fabricSource.toLowerCase()],
          ["Measurements", labelOf(MEASUREMENT_METHODS, order.measurementMethod)],
          ["Fulfilment", order.fulfilment.toLowerCase()],
          ["Delivery address", order.addressText ?? "—"],
          ["Needed by", formatDate(order.neededBy)],
          ["Total", formatMoney(order.totalMinor)],
          ["Deposit", formatMoney(order.depositMinor)],
          ["Paid", formatMoney(order.amountPaidMinor)],
          ["Refunded", formatMoney(order.amountRefundedMinor)],
          ["Completed", formatDateTime(order.completedAt)],
          ["Cancel reason", order.cancelReason ?? "—"],
          ...(order.parentOrder ? [["Fabric for order", <Link key="p" href={`/admin/orders/${order.parentOrder.id}`} className="text-brand-700 hover:underline">#{order.parentOrder.number}</Link>] as [string, ReactNode]] : []),
          ...(order.fabricOrders.length ? [["Fabric orders", order.fabricOrders.map((f) => `#${f.number} (${labelOf(ORDER_STATUS, f.status)})`).join(", ")] as [string, ReactNode]] : []),
        ]} />
        {order.instructions && <p className="whitespace-pre-line break-words rounded bg-stone-50 p-3 text-sm text-stone-700">{order.instructions}</p>}
        <p className="text-xs text-stone-500">Measurement values are not shown in the admin portal.</p>
      </Section>

      <Section title={`Quotations (${order.quotations.length})`}>
        {order.quotations.length ? order.quotations.map((q) => (
          <div key={q.id} className="space-y-2 rounded-lg border border-stone-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 break-words font-medium">{q.business.name} · v{q.version}{q.id === order.acceptedQuotationId ? " · accepted" : ""}</p>
              <Badge tone={q.status === "ACCEPTED" ? "green" : q.status === "SUBMITTED" ? "gold" : "grey"}>{q.status.toLowerCase()}</Badge>
            </div>
            {q.lines.length > 0 && (
              <ul className="divide-y divide-stone-100 text-sm">
                {q.lines.map((l) => (
                  <li key={l.id} className="flex justify-between gap-3 py-1"><span className="min-w-0 break-words">{labelOf(QUOTE_LINE_KINDS, l.kind)}: {l.description}</span><span className="tabular-nums">{formatMoney(l.amountMinor)}</span></li>
                ))}
              </ul>
            )}
            <p className="text-sm text-stone-600">Total {formatMoney(q.totalMinor)} · deposit {formatMoney(q.depositMinor)} · ready {formatDate(q.completionDate)}</p>
            {q.message && <p className="break-words text-sm text-stone-600">“{q.message}”</p>}
          </div>
        )) : <p className="text-sm text-stone-500">None.</p>}
      </Section>

      <Section title="Payments">
        {order.payments.length ? (
          <Table head={["Created", "Purpose", "Amount", "Provider", "Reference", "Status"]}>
            {order.payments.map((p) => (
              <tr key={p.id}>
                <Td>{formatDateTime(p.createdAt)}</Td><Td>{p.purpose.toLowerCase()}</Td><Td className="tabular-nums">{formatMoney(p.amountMinor)}</Td>
                <Td>{p.provider}</Td><Td className="break-all">{p.providerRef}</Td>
                <Td>{p.status.toLowerCase()}{p.failureReason ? ` (${p.failureReason})` : ""}</Td>
              </tr>
            ))}
          </Table>
        ) : <p className="text-sm text-stone-500">No payments.</p>}
        <h3 className="text-sm font-semibold text-stone-700">Refunds</h3>
        {order.refunds.length ? (
          <Table head={["Created", "Amount", "Status", "Reason", "Decided by", "Ref"]}>
            {order.refunds.map((r) => (
              <tr key={r.id}>
                <Td>{formatDateTime(r.createdAt)}</Td><Td className="tabular-nums">{formatMoney(r.amountMinor)}</Td><Td>{r.status.toLowerCase()}</Td>
                <Td className="break-words">{r.reason}</Td><Td>{r.decidedById === "system" ? "System" : (r.decidedById && names.get(r.decidedById)?.name) || "—"}</Td><Td className="break-all">{r.providerRef ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        ) : <p className="text-sm text-stone-500">No refunds.</p>}
      </Section>

      <Section title="Ledger entries">
        {ledger.length ? (
          <Table head={["When", "Account", "Party", "Type", "Amount", "Memo"]}>
            {ledger.map((l) => (
              <tr key={l.id}>
                <Td>{formatDateTime(l.createdAt)}</Td><Td>{l.account}</Td><Td>{l.partyType ? `${l.partyType.toLowerCase()} ${l.partyId?.slice(-6)}` : "—"}</Td>
                <Td>{l.type}</Td><Td className="tabular-nums">{formatMoney(l.amountMinor)}</Td><Td className="break-words">{l.memo}</Td>
              </tr>
            ))}
          </Table>
        ) : <p className="text-sm text-stone-500">No ledger entries.</p>}
      </Section>

      <Section title="Deliveries">
        {order.deliveries.length ? (
          <ul className="divide-y divide-stone-100 text-sm">
            {order.deliveries.map((d) => (
              <li key={d.id} className="space-y-0.5 py-2">
                <p className="font-medium">{labelOf(DELIVERY_LEGS, d.leg)} · attempt {d.attempt} · {labelOf(DELIVERY_STATUS, d.status)}</p>
                <p className="break-words text-stone-600">{d.pickupName} → {d.dropoffName} ({d.dropoffAddress}) · fee {formatMoney(d.feeMinor)}</p>
                <p className="text-stone-600">Rider: {d.rider ? `${d.rider.name} · ${d.rider.phone}` : "none"} · created {formatDateTime(d.createdAt)}{d.deliveredAt ? ` · delivered ${formatDateTime(d.deliveredAt)}` : ""}</p>
                {d.failureReason && <p className="break-words text-red-700">Failed: {d.failureReason}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-stone-500">None.</p>}
      </Section>

      <Section title="Appointments">
        {order.appointments.length ? (
          <ul className="divide-y divide-stone-100 text-sm">
            {order.appointments.map((a) => (
              <li key={a.id} className="py-2">
                <p className="font-medium">{a.kind === "HOME_VISIT" ? "Home visit" : "Workshop visit"} · {labelOf(APPOINTMENT_STATUS, a.status)}</p>
                <p className="text-stone-600">{formatDateTime(a.windowStart)} – {formatDateTime(a.windowEnd)} · {a.professional?.name ?? "no professional yet"} · fee {formatMoney(a.feeMinor)}</p>
                {a.failureReason && <p className="break-words text-red-700">{a.failureReason}</p>}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-stone-500">None.</p>}
      </Section>

      <Section title="Disputes">
        {order.disputes.length ? (
          <ul className="space-y-1 text-sm">
            {order.disputes.map((d) => (
              <li key={d.id}>
                {canDisputes ? <Link href={`/admin/disputes/${d.id}`} className="font-medium text-brand-700 hover:underline">Dispute #{d.number}</Link> : <span className="font-medium">Dispute #{d.number}</span>}
                {" "}· {labelOf(DISPUTE_CATEGORIES, d.category)} · {labelOf(DISPUTE_STATUS, d.status)} · {formatDate(d.createdAt)}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-stone-500">None.</p>}
      </Section>

      <Section title="Timeline">
        <ol className="space-y-2 text-sm">
          {order.events.map((e) => (
            <li key={e.id} className="border-l-2 border-stone-200 pl-3">
              <p className="font-medium">
                {e.toStatus ? `${e.fromStatus ? labelOf(ORDER_STATUS, e.fromStatus) + " → " : ""}${labelOf(ORDER_STATUS, e.toStatus)}` : e.type.toLowerCase()}
              </p>
              <p className="text-stone-600">{formatDateTime(e.createdAt)} · {e.actorRole.toLowerCase()}{e.actorId && names.get(e.actorId) ? ` (${names.get(e.actorId)!.name})` : ""}</p>
              {e.note && <p className="break-words text-stone-700">{e.note}</p>}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Administrator actions">
        <div className="space-y-6">
          {canReopen && (
            <ActionForm action={reopenDeliveryAction} className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <p className="text-sm text-stone-700">The last delivery failed. Reopen it so riders are offered the job again.</p>
              <ConfirmButton className="btn-secondary" confirmText="Tap again to reopen">Reopen delivery</ConfirmButton>
            </ActionForm>
          )}

          {canRefund && (
            <ActionForm action={adminRefundAction} resetOnSuccess className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <h3 className="font-semibold">Refund</h3>
              <p className="text-sm text-stone-700">Up to <strong>{formatMoney(refundable)}</strong> can be refunded (paid {formatMoney(order.amountPaidMinor)}, already refunded {formatMoney(order.amountRefundedMinor)}). For a disagreement between customer and business, resolve the dispute instead.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="amount">Amount (GH₵)</label>
                  <input id="amount" name="amount" inputMode="decimal" required className="input" placeholder="e.g. 50" />
                </div>
                <div>
                  <label className="label" htmlFor="refund-reason">Reason</label>
                  <input id="refund-reason" name="reason" required maxLength={500} className="input" />
                </div>
              </div>
              <ConfirmButton confirmText="Tap again to refund">Refund</ConfirmButton>
            </ActionForm>
          )}

          {canCancel ? (
            <ActionForm action={adminCancelOrderAction} className="space-y-3">
              <input type="hidden" name="orderId" value={order.id} />
              <h3 className="font-semibold">Cancel order</h3>
              <p className="text-sm text-stone-700">
                {order.amountPaidMinor > 0 ? "Money paid is refunded under the cancellation policy (less a home measurement visit that already happened)." : "Nothing has been paid."} Customer and business are told the reason.
              </p>
              <div>
                <label className="label" htmlFor="cancel-reason">Reason</label>
                <input id="cancel-reason" name="reason" required maxLength={300} className="input" />
              </div>
              <ConfirmButton confirmText="Tap again to cancel the order">Cancel order</ConfirmButton>
            </ActionForm>
          ) : (
            <p className="text-sm text-stone-500">This order can't be cancelled at this stage{order.status === "DISPUTED" ? "; resolve the dispute instead" : ""}.</p>
          )}
          {!canReopen && !canRefund && !isAdmin(actor, "FINANCE") && refundable > 0 && <p className="text-sm text-stone-500">Refunds need the Finance permission.</p>}
        </div>
      </Section>
    </div>
  );
}
