import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDate, formatDateTime } from "@/lib/time";
import { directionsUrl } from "@/lib/geo";
import {
  APPOINTMENT_STATUS, DELIVERY_LEGS, DELIVERY_STATUS, DISPUTE_STATUS, labelOf, MEASUREMENT_FIELDS, MEASUREMENT_METHODS, ORDER_STATUS, PAYMENT_STATUS, QUOTE_LINE_KINDS,
} from "@/lib/enums";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, Dl, OrderStatusBadge, PageHeader, Section } from "@/components/ui/basics";
import { StyleImage } from "@/components/swatch";
import { requireActor } from "@/server/auth";
import { privateUrl } from "@/server/files";
import { loadOrderAccess, relationsFor } from "@/server/order-flow";
import { RESUMABLE_FROM_DISPUTE, WORK_STARTED } from "@/server/order-machine";
import { amountDue } from "@/server/services/payments";
import {
  acceptQuoteAction, bookWorkshopVisitAction, cancelOrderAction, confirmCompletionAction, confirmLegacyDeliveryAction, confirmMeasurementsAction,
  decideRevisionAction, deliveryCodeAction, payAction, pickupCodeAction, rescheduleVisitAction, retryDeliveryAction, reviewAction,
} from "@/app/actions/orders";
import { FulfilmentForm } from "./fulfilment-form";

export const dynamic = "force-dynamic";

const PAYMENT_BANNER: Record<string, { tone: string; text: string }> = {
  success: { tone: "bg-brand-50 text-brand-700", text: "Payment confirmed. Thank you!" },
  pending: { tone: "bg-gold-100 text-amber-900", text: "We're waiting for the payment provider to confirm. Refresh in a minute; you don't need to pay again." },
  failed: { tone: "bg-red-50 text-red-800", text: "That payment didn't go through. Nothing was charged; you can try again." },
};

type Line = { id: string; kind: string; description: string; amountMinor: number };
function Lines({ lines, total }: { lines: Line[]; total: number }) {
  return (
    <table className="w-full text-sm">
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className="border-b border-stone-100">
            <td className="py-1.5 pr-2"><span className="block">{l.description}</span><span className="text-xs text-stone-500">{labelOf(QUOTE_LINE_KINDS, l.kind)}</span></td>
            <td className="whitespace-nowrap py-1.5 text-right">{formatMoney(l.amountMinor)}</td>
          </tr>
        ))}
        <tr><th scope="row" className="py-1.5 text-left">Total</th><td className="py-1.5 text-right font-semibold">{formatMoney(total)}</td></tr>
      </tbody>
    </table>
  );
}

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string; created?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  const access = await loadOrderAccess(db, id).catch(() => null);
  if (!access) notFound();
  const rel = relationsFor(actor, access);
  if (!rel.includes("CUSTOMER")) {
    if (rel.includes("BUSINESS")) redirect(`/biz/${access.businessId ?? access.quotations.find((q) => actor.memberships.some((m) => m.businessId === q.businessId))?.businessId}/orders/${id}`);
    if (rel.includes("ADMIN")) redirect(`/admin/orders/${id}`);
    notFound();
  }

  const order = await db.order.findUniqueOrThrow({
    where: { id },
    include: {
      style: true, business: true, fabricListing: { include: { business: true } },
      quotations: { include: { business: true, lines: { orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 60 },
      appointments: { include: { professional: { select: { name: true, phone: true } }, business: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
      deliveries: { include: { rider: { select: { name: true, phone: true } } }, orderBy: { createdAt: "desc" } },
      measurementRecord: { include: { profile: true } },
      payments: { orderBy: { createdAt: "desc" } },
      refunds: { orderBy: { createdAt: "desc" } },
      review: true,
      disputes: { orderBy: { createdAt: "desc" } },
      fabricOrders: { include: { fabricListing: true } },
      parentOrder: { include: { style: true } },
    },
  });
  const addresses = await db.savedAddress.findMany({ where: { userId: actor.userId } });
  const refFiles = order.referenceFileIds.length ? await db.storedFile.findMany({ where: { id: { in: order.referenceFileIds } } }) : [];

  const s = order.status;
  const accepted = order.quotations.find((q) => q.id === order.acceptedQuotationId);
  const offers = order.quotations.filter((q) => !q.revisionOfId && ["SUBMITTED", "REQUESTED", "DECLINED", "EXPIRED"].includes(q.status));
  const revision = order.quotations.find((q) => q.revisionOfId && q.status === "SUBMITTED");
  const depositDue = amountDue(order, "DEPOSIT");
  const balanceDue = amountDue(order, "BALANCE");
  const payable = ["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION", "QUALITY_CHECK", "READY"].includes(s);
  const visit = order.appointments.find((a) => a.kind === "HOME_VISIT");
  const workshopVisit = order.appointments.find((a) => a.kind === "WORKSHOP" && a.status === "ACCEPTED");
  const leg = order.deliveries.find((d) => d.status !== "CANCELLED");
  const failedLeg = order.deliveries[0]?.status === "FAILED" ? order.deliveries[0] : null;
  const openDispute = order.disputes.find((d) => !["RESOLVED", "REJECTED"].includes(d.status));
  const canCancel = !WORK_STARTED.includes(s as never) && !["CANCELLED", "REFUNDED", "DISPUTED", "DRAFT"].includes(s);
  const canDispute = !openDispute && RESUMABLE_FROM_DISPUTE.includes(s as never) && (s !== "COMPLETED" || !order.completedAt || Date.now() - order.completedAt.getTime() < 30 * 86_400_000);
  const title = order.kind === "FABRIC" ? `${order.fabricListing?.name ?? "Fabric"}` : order.style?.name ?? "Custom outfit";
  const banner = sp.payment ? PAYMENT_BANNER[sp.payment] : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`#${order.number} · ${title}`}
        back={{ href: "/orders", label: "My orders" }}
        subtitle={<span className="flex flex-wrap items-center gap-2"><OrderStatusBadge status={s} /><Badge>{labelOf(PAYMENT_STATUS, order.paymentStatus)}</Badge>{order.isDemo && <Badge tone="blue">Demo</Badge>}</span>}
        actions={<Link href={`/orders/${order.id}/messages`} className="btn-secondary">💬 Messages</Link>}
      />
      {sp.created && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">{order.kind === "FABRIC" ? "Order placed. The seller will confirm the fabric is available, then you can pay." : "Request sent. You'll be notified as quotes arrive."}</p>}
      {banner && <p role="status" className={`rounded-lg px-3 py-2 text-sm ${banner.tone}`}>{banner.text}</p>}

      <div className="card border-brand-500 bg-brand-50/40">
        <p className="text-sm font-semibold">{ORDER_STATUS[s as keyof typeof ORDER_STATUS]?.label ?? s}</p>
        <p className="text-sm text-stone-700">{ORDER_STATUS[s as keyof typeof ORDER_STATUS]?.help}</p>
        {s === "CANCELLED" && order.cancelReason && <p className="mt-1 text-sm text-stone-600">Reason: {order.cancelReason}</p>}
      </div>

      {/* Quotes to compare */}
      {(s === "QUOTE_REQUESTED" || s === "QUOTED") && order.kind === "CUSTOM" && (
        <Section title="Quotes">
          <p className="text-sm text-stone-600">Compare the itemised quotes. Accepting one closes the others. You pay only after accepting.</p>
          <ul className="grid gap-4 md:grid-cols-2">
            {offers.map((q) => (
              <li key={q.id} className="rounded-xl border border-stone-200 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/tailors/${q.business.slug}`} className="font-semibold hover:text-brand-700">{q.business.name}</Link>
                  <span className="flex gap-1"><DemoBadge show={q.business.isDemo} />{q.status === "REQUESTED" ? <Badge tone="gold">Waiting</Badge> : q.status === "SUBMITTED" ? <Badge tone="green">Quoted</Badge> : <Badge>{q.status === "DECLINED" ? "Declined" : "Expired"}</Badge>}</span>
                </div>
                {q.status === "SUBMITTED" ? (
                  <div className="space-y-2">
                    <Lines lines={q.lines} total={q.totalMinor} />
                    <p className="text-xs text-stone-600">Deposit {formatMoney(q.depositMinor)} · ready by {formatDate(q.completionDate)} · valid until {formatDate(q.validUntil)}</p>
                    {q.message && <p className="whitespace-pre-line rounded-lg bg-stone-50 p-2 text-sm">“{q.message}”</p>}
                    <ActionForm action={acceptQuoteAction}>
                      <input type="hidden" name="quotationId" value={q.id} />
                      <ConfirmButton className="btn-primary w-full" confirmText={`Accept for ${formatMoney(q.totalMinor)}?`}>Accept this quote</ConfirmButton>
                    </ActionForm>
                  </div>
                ) : q.status === "DECLINED" ? (
                  <p className="text-sm text-stone-600">{q.message || "This business can't take the order."}</p>
                ) : (
                  <p className="text-sm text-stone-600">{q.status === "REQUESTED" ? "Waiting for their quote." : "This quote expired."}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {order.kind === "FABRIC" && s === "QUOTE_REQUESTED" && <p className="card text-sm text-stone-600">Waiting for the seller to confirm the fabric. It's held for you meanwhile.</p>}

      {/* Proposed change */}
      {revision && accepted && (
        <Section title="Change proposed by the business">
          <p className="whitespace-pre-line text-sm">{revision.message}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div><p className="mb-1 text-xs font-semibold uppercase text-stone-500">Now</p><Lines lines={accepted.lines} total={accepted.totalMinor} /></div>
            <div><p className="mb-1 text-xs font-semibold uppercase text-stone-500">Proposed</p><Lines lines={revision.lines} total={revision.totalMinor} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={decideRevisionAction}><input type="hidden" name="revisionId" value={revision.id} /><input type="hidden" name="decision" value="approve" /><SubmitButton>Approve the change</SubmitButton></ActionForm>
            <ActionForm action={decideRevisionAction}><input type="hidden" name="revisionId" value={revision.id} /><input type="hidden" name="decision" value="reject" /><SubmitButton className="btn-secondary">Keep the original</SubmitButton></ActionForm>
          </div>
        </Section>
      )}

      {/* Payment */}
      {payable && order.totalMinor > 0 && (depositDue > 0 || balanceDue > 0) && (
        <Section title="Payment">
          <Dl items={[["Total", formatMoney(order.totalMinor)], ["Paid", formatMoney(order.amountPaidMinor)], ["Deposit", formatMoney(order.depositMinor)], ["Left to pay", formatMoney(balanceDue)]]} />
          <div className="flex flex-wrap gap-2">
            {depositDue > 0 && depositDue < balanceDue && (
              <ActionForm action={payAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="purpose" value="DEPOSIT" /><SubmitButton pendingText="Opening checkout…">Pay deposit {formatMoney(depositDue)}</SubmitButton></ActionForm>
            )}
            <ActionForm action={payAction}><input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="purpose" value="BALANCE" /><SubmitButton className={depositDue > 0 && depositDue < balanceDue ? "btn-secondary" : "btn-primary"} pendingText="Opening checkout…">Pay {formatMoney(balanceDue)}{order.amountPaidMinor > 0 ? " balance" : " in full"}</SubmitButton></ActionForm>
          </div>
          <p className="text-xs text-stone-500">Mobile Money or card through our payment provider. We never see your PIN or card number.{s === "READY" ? " The balance must be paid before handover." : ""}</p>
        </Section>
      )}

      {/* Measurements */}
      {order.kind === "CUSTOM" && order.measurementMethod && !["QUOTE_REQUESTED", "QUOTED", "CANCELLED"].includes(s) && (
        <Section title="Measurements">
          <p className="text-sm text-stone-600">{labelOf(MEASUREMENT_METHODS, order.measurementMethod)}</p>
          {visit && (
            <div className="space-y-2 rounded-xl bg-stone-50 p-3 text-sm">
              <p><strong>Home visit:</strong> {formatDateTime(visit.windowStart)} – {formatDateTime(visit.windowEnd)} · {labelOf(APPOINTMENT_STATUS, visit.status)}</p>
              {visit.professional && visit.status === "ACCEPTED" && <p>{visit.professional.name} will come. Phone: <a className="text-brand-700 underline" href={`tel:${visit.professional.phone.replace(/\s/g, "")}`}>{visit.professional.phone}</a></p>}
              {visit.status === "FAILED" && <p className="text-red-800">The visit didn't happen: {visit.failureReason}. Choose a new time below.</p>}
              {visit.status === "REQUESTED" && order.amountPaidMinor < order.depositMinor && <p className="text-stone-600">Professionals are told about the visit once the deposit is paid.</p>}
              {["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS"].includes(s) && ["REQUESTED", "ACCEPTED", "FAILED"].includes(visit.status) && (
                <details>
                  <summary className="cursor-pointer text-brand-700">Change the visit time</summary>
                  <ActionForm action={rescheduleVisitAction} className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input type="hidden" name="orderId" value={order.id} />
                    <input type="datetime-local" name="start" aria-label="From" className="input" required />
                    <input type="datetime-local" name="end" aria-label="Until" className="input" required />
                    <SubmitButton className="btn-secondary">Save time</SubmitButton>
                  </ActionForm>
                </details>
              )}
            </div>
          )}
          {order.measurementMethod === "AT_WORKSHOP" && order.business && s === "AWAITING_MEASUREMENTS" && (
            workshopVisit ? <p className="text-sm">Workshop visit booked for {formatDateTime(workshopVisit.windowStart)} at {order.business.address}.</p> : (
              <ActionForm action={bookWorkshopVisitAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="orderId" value={order.id} />
                <div><label className="label" htmlFor="ws">When will you visit {order.business.name}?</label><input id="ws" type="datetime-local" name="start" className="input" required /></div>
                <SubmitButton className="btn-secondary">Book visit</SubmitButton>
              </ActionForm>
            )
          )}
          {order.measurementRecord && (
            <div className="space-y-2">
              <p className="text-sm">Using <strong>{order.measurementRecord.profile.label}</strong>, revision {order.measurementRecord.revision} ({order.measurementRecord.source.toLowerCase()}).</p>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {Object.entries(order.measurementRecord.values as Record<string, { value: number; unit: string }>).map(([k, v]) => <li key={k}><span className="text-stone-500">{labelOf(MEASUREMENT_FIELDS, k)}:</span> {v.value} {v.unit}</li>)}
              </ul>
              {order.measurementRecord.status === "SUBMITTED" && (
                <ActionForm action={confirmMeasurementsAction}><input type="hidden" name="recordId" value={order.measurementRecord.id} /><SubmitButton className="btn-secondary">These look right</SubmitButton></ActionForm>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Handover */}
      {order.kind === "CUSTOM" && s === "READY" && order.business && (
        <Section title="Collect or deliver">
          <FulfilmentForm orderId={order.id} businessName={order.business.name} businessAddress={`${order.business.address}, ${order.business.city}`} current={order.fulfilment}
            savedAddresses={addresses.map((a) => ({ id: a.id, label: a.label, addressText: a.addressText, lat: a.lat, lng: a.lng }))} />
        </Section>
      )}
      {s === "READY" && order.fulfilment === "PICKUP" && order.business && (
        <Section title="Pickup">
          <p className="text-sm">Collect from <strong>{order.business.name}</strong>, {order.business.address}, {order.business.city}. <a href={directionsUrl(order.business.lat, order.business.lng)} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Directions</a></p>
          {balanceDue > 0 ? <p className="text-sm text-amber-800">Pay the balance first, then get your pickup code.</p> : (
            <ActionForm action={pickupCodeAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <p className="text-sm text-stone-600">Show this code at the workshop only when you have your order. Getting a new code cancels the old one.</p>
              <SubmitButton className="btn-secondary">Show my pickup code</SubmitButton>
            </ActionForm>
          )}
        </Section>
      )}
      {(leg || failedLeg) && (
        <Section title="Delivery">
          {leg && (
            <div className="space-y-2 text-sm">
              <p><strong>{labelOf(DELIVERY_LEGS, leg.leg)}</strong> · {labelOf(DELIVERY_STATUS, leg.status)} · fee {formatMoney(leg.feeMinor)}</p>
              <p className="text-stone-600">From {leg.pickupName} to {leg.dropoffAddress}</p>
              {leg.rider && ["ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(leg.status) && <p>Rider: {leg.rider.name}, <a className="text-brand-700 underline" href={`tel:${leg.rider.phone.replace(/\s/g, "")}`}>{leg.rider.phone}</a></p>}
              {leg.status === "PENDING_PAYMENT" && <p className="text-amber-800">Pay the balance and the delivery will be sent to riders.</p>}
              {["OPEN", "ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(leg.status) && (leg.proofCodeHash === "LEGACY" ? (
                <ActionForm action={confirmLegacyDeliveryAction}><input type="hidden" name="orderId" value={order.id} /><ConfirmButton className="btn-secondary" confirmText="Tap again: I have my order">I've received it</ConfirmButton></ActionForm>
              ) : (
                <ActionForm action={deliveryCodeAction}>
                  <input type="hidden" name="orderId" value={order.id} />
                  <p className="text-stone-600">Your 6-digit delivery code was sent to you by SMS and in your notifications. Give it to the rider only when you have your order.</p>
                  <SubmitButton className="btn-secondary">Get a new code</SubmitButton>
                </ActionForm>
              ))}
            </div>
          )}
          {failedLeg && s === "READY" && (
            <div className="space-y-2 text-sm">
              <p className="text-red-800">Delivery attempt {failedLeg.attempt} failed: {failedLeg.failureReason}</p>
              <ActionForm action={retryDeliveryAction}><input type="hidden" name="orderId" value={order.id} /><SubmitButton className="btn-secondary">Try delivery again</SubmitButton></ActionForm>
            </div>
          )}
        </Section>
      )}

      {/* Completion */}
      {(s === "DELIVERED" || s === "COLLECTED") && (
        <Section title="Is everything right?">
          <p className="text-sm text-stone-600">Confirm to complete the order. If there's a problem, report it instead; the order completes automatically after a few days otherwise.</p>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={confirmCompletionAction}><input type="hidden" name="orderId" value={order.id} /><ConfirmButton className="btn-primary" confirmText="Tap again to confirm">Yes, all good</ConfirmButton></ActionForm>
            <Link href={`/orders/${order.id}/dispute`} className="btn-secondary">Report a problem</Link>
          </div>
        </Section>
      )}

      {s === "COMPLETED" && order.businessId && !order.review && (
        <Section title="Leave a review">
          <ActionForm action={reviewAction} className="space-y-3">
            <input type="hidden" name="orderId" value={order.id} />
            <fieldset className="flex gap-3" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => <label key={n} className="flex items-center gap-1 text-sm"><input type="radio" name="rating" value={n} required /> {n}★</label>)}
            </fieldset>
            <textarea name="comment" rows={3} maxLength={1000} className="input" aria-label="Comment" placeholder="How was the fit, the finish, the communication?" />
            <SubmitButton>Post review</SubmitButton>
          </ActionForm>
        </Section>
      )}
      {order.review && <p className="card text-sm">You rated this order {order.review.rating}★{order.review.comment ? `: “${order.review.comment}”` : ""}</p>}

      {/* The order */}
      <Section title="Order details">
        <div className="flex gap-4">
          {order.style && <StyleImage icon={order.style.icon} imageUrl={order.style.imageUrl} className="h-20 w-20 shrink-0 text-3xl" />}
          <div className="min-w-0 flex-1">
            <Dl items={[
              ...(order.business ? [["Business", <Link key="b" href={`/tailors/${order.business.slug}`} className="text-brand-700 underline">{order.business.name}</Link>] as [string, React.ReactNode]] : []),
              ...(order.kind === "FABRIC" ? [["Quantity", formatQty(order.fabricQtyCenti, order.fabricListing?.unit)] as [string, React.ReactNode]] : [["Fabric", { OWN: "My own", BUSINESS: "From the tailor", SELLER: "From a fabric seller" }[order.fabricSource]] as [string, React.ReactNode]]),
              ...(order.budgetMinor ? [["My budget (private)", formatMoney(order.budgetMinor)] as [string, React.ReactNode]] : []),
              ...(order.neededBy ? [["Needed by", formatDate(order.neededBy)] as [string, React.ReactNode]] : []),
              ...(accepted?.completionDate ? [["Promised by", formatDate(accepted.completionDate)] as [string, React.ReactNode]] : []),
              ["Placed", formatDateTime(order.createdAt)],
            ]} />
          </div>
        </div>
        {Object.keys(order.designChoices as object).length > 0 && (
          <p className="text-sm"><strong>Details:</strong> {Object.entries(order.designChoices as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
        )}
        {order.instructions && <p className="whitespace-pre-line text-sm"><strong>Notes:</strong> {order.instructions}</p>}
        {refFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {refFiles.map((f) => <a key={f.id} href={privateUrl(f)} target="_blank" rel="noopener noreferrer"><img src={privateUrl(f)} alt="Reference" className="h-20 w-20 rounded-lg object-cover" /></a>)}
          </div>
        )}
        {accepted && <details><summary className="cursor-pointer text-sm font-medium text-brand-700">Accepted quote</summary><div className="mt-2"><Lines lines={accepted.lines} total={accepted.totalMinor} /></div></details>}
        {order.fabricSource === "SELLER" && order.kind === "CUSTOM" && order.businessId && !WORK_STARTED.includes(s as never) && s !== "CANCELLED" && (
          <p className="text-sm">Need fabric? <Link href="/fabrics" className="text-brand-700 underline">Buy it from a seller</Link> and choose “deliver to my tailor”.</p>
        )}
        {order.fabricOrders.length > 0 && <p className="text-sm">Fabric orders: {order.fabricOrders.map((f) => <Link key={f.id} href={`/orders/${f.id}`} className="mr-2 text-brand-700 underline">#{f.number}</Link>)}</p>}
        {order.parentOrder && <p className="text-sm">For outfit <Link href={`/orders/${order.parentOrder.id}`} className="text-brand-700 underline">#{order.parentOrder.number}</Link></p>}
      </Section>

      {(order.payments.length > 0 || order.refunds.length > 0) && (
        <Section title="Payments and refunds">
          <ul className="space-y-1 text-sm">
            {order.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2"><span>{formatDateTime(p.createdAt)} · {p.provider === "SANDBOX" ? "Sandbox (no real money)" : p.provider === "LEGACY" ? "Earlier payment" : "Paystack"} · ref {p.providerRef}</span><span>{formatMoney(p.amountMinor)} · {p.status.toLowerCase()}</span></li>
            ))}
            {order.refunds.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 text-stone-700"><span>Refund · {formatDateTime(r.createdAt)} · {r.reason}</span><span>{formatMoney(r.amountMinor)} · {r.status.toLowerCase()}</span></li>
            ))}
          </ul>
        </Section>
      )}

      {order.disputes.length > 0 && (
        <Section title="Disputes">
          <ul className="text-sm">{order.disputes.map((d) => <li key={d.id}><Link href={`/support/disputes/${d.id}`} className="text-brand-700 underline">Dispute #{d.number}</Link> · {labelOf(DISPUTE_STATUS, d.status)}</li>)}</ul>
        </Section>
      )}

      <Section title="Timeline">
        <ol className="space-y-2 border-l-2 border-stone-200 pl-4 text-sm">
          {order.events.map((e) => (
            <li key={e.id}>
              <p>{e.type === "STATUS" && e.toStatus ? <strong>{labelOf(ORDER_STATUS, e.toStatus)}</strong> : null}{e.type === "STATUS" && e.note ? " · " : ""}{e.note}</p>
              <p className="text-xs text-stone-500">{formatDateTime(e.createdAt)}</p>
            </li>
          ))}
        </ol>
      </Section>

      <div className="flex flex-wrap gap-2">
        {canDispute && s !== "DELIVERED" && s !== "COLLECTED" && <Link href={`/orders/${order.id}/dispute`} className="btn-secondary">Report a problem</Link>}
        {canCancel && (
          <ActionForm action={cancelOrderAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="orderId" value={order.id} />
            <input name="reason" aria-label="Reason for cancelling" placeholder="Reason (optional)" className="input w-auto" />
            <ConfirmButton confirmText={order.amountPaidMinor > 0 ? "Tap again: cancel and refund" : "Tap again to cancel"}>Cancel order</ConfirmButton>
          </ActionForm>
        )}
      </div>
    </div>
  );
}
