import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, Dl, OrderStatusBadge, PageHeader, Section } from "@/components/ui/basics";
import { StyleImage } from "@/components/swatch";
import { db } from "@/lib/db";
import {
  APPOINTMENT_STATUS, DELIVERY_LEGS, DELIVERY_STATUS, labelOf, MEASUREMENT_FIELDS, MEASUREMENT_METHODS, MEASUREMENT_UNITS, ORDER_STATUS, PAYMENT_STATUS, QUOTE_LINE_KINDS,
} from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { addDays, formatDate, formatDateTime } from "@/lib/time";
import { privateUrl } from "@/server/files";
import { canTransition, nextStatuses } from "@/server/order-machine";
import { atLeast, availableCenti, businessPage, designLines, orderForBusiness } from "@/server/queries/business";
import { getSettings } from "@/server/settings";
import {
  advanceOrderAction, businessCancelOrderAction, declineQuoteAction, fabricOrderRespondAction, markCollectedAction, proposeRevisionAction,
  submitQuoteAction, workshopMeasurementsAction,
} from "../../../../actions/business";
import { QuoteFields, type QuoteListing } from "./quote-fields";

export const metadata = { title: "Order" };

const FABRIC_SOURCE: Record<string, string> = { OWN: "The customer brings their own fabric", BUSINESS: "From your stock", SELLER: "Bought from a fabric seller and delivered to you" };
const QUOTE_STATUS: Record<string, string> = {
  REQUESTED: "Waiting for your quote", SUBMITTED: "Waiting for the customer", ACCEPTED: "Accepted", DECLINED: "You declined",
  REJECTED: "Not chosen", WITHDRAWN: "Withdrawn", EXPIRED: "Expired", SUPERSEDED: "Replaced by a change",
};
const BUSINESS_STEPS = ["MEASUREMENTS_CONFIRMED", "AWAITING_MEASUREMENTS", "IN_PRODUCTION", "QUALITY_CHECK", "READY"] as const;
const REVISABLE = ["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION"];
const CANCELLABLE = ["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED"];

function stepLabel(from: string, to: string) {
  if (to === "MEASUREMENTS_CONFIRMED") return "Confirm measurements";
  if (to === "AWAITING_MEASUREMENTS") return "Ask for new measurements";
  if (to === "IN_PRODUCTION") return from === "QUALITY_CHECK" ? "Back to sewing (needs more work)" : "Start sewing";
  if (to === "QUALITY_CHECK") return "Move to quality check";
  return "Mark as ready";
}

export default async function BusinessOrderPage({ params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  const { role, business } = await businessPage(id);
  const data = await orderForBusiness(id, orderId);
  if (!data) notFound();
  const { order, assigned, events, customer, measurement, appointments, deliveries } = data;
  const base = `/biz/${id}`;
  const manager = atLeast(role, "MANAGER");
  const verified = business.verificationStatus === "VERIFIED";
  const isFabric = order.kind === "FABRIC";

  const quotes = order.quotations;
  const request = quotes.find((q) => q.status === "REQUESTED" && !q.revisionOfId);
  const pendingRevision = quotes.find((q) => q.revisionOfId && q.status === "SUBMITTED");
  const accepted = quotes.find((q) => q.id === order.acceptedQuotationId);
  const quoteOpen = quotes.some((q) => ["REQUESTED", "SUBMITTED"].includes(q.status) && !q.revisionOfId);
  const canSeeRequest = assigned || quoteOpen;
  const collectingQuotes = ["QUOTE_REQUESTED", "QUOTED"].includes(order.status);

  const needsQuoteForm = !isFabric && !!request && collectingQuotes;
  const canRevise = !isFabric && assigned && !!accepted && REVISABLE.includes(order.status) && !pendingRevision;
  const settings = needsQuoteForm || canRevise ? await getSettings() : null;
  const listings: QuoteListing[] =
    (needsQuoteForm || canRevise) && order.fabricSource === "BUSINESS"
      ? await Promise.all(
          (await db.fabricListing.findMany({ where: { businessId: id, status: "ACTIVE" }, orderBy: { name: "asc" } })).map(async (l) => {
            const held = assigned
              ? (await db.fabricReservation.aggregate({ where: { orderId: order.id, listingId: l.id, status: { in: ["ACTIVE", "CONSUMED"] } }, _sum: { qtyCenti: true } }))._sum.qtyCenti ?? 0
              : 0;
            return { id: l.id, name: l.name, unit: l.unit, pricePerUnitMinor: l.pricePerUnitMinor, available: availableCenti(l) + held };
          }),
        )
      : [];
  const minDate = addDays(new Date(), 1).toISOString().slice(0, 10);
  const defaultFabricQty = String((order.fabricQtyCenti || order.style?.fabricQtyCenti || 0) / 100 || "");

  const steps = assigned && !isFabric
    ? nextStatuses(order.status).filter((s): s is (typeof BUSINESS_STEPS)[number] => (BUSINESS_STEPS as readonly string[]).includes(s) && canTransition(order.status, s, ["BUSINESS"]))
    : [];
  const choices = designLines(order.designChoices, order.style?.options);
  const measurementValues = (measurement?.values ?? {}) as Record<string, { value: number; unit: string }>;
  const measuringHere = assigned && order.status === "AWAITING_MEASUREMENTS" && order.measurementMethod === "AT_WORKSHOP";
  const pickupHandover = assigned && order.status === "READY" && order.fulfilment === "PICKUP";
  const fabricToConfirm = isFabric && assigned && order.status === "QUOTE_REQUESTED";

  const title = isFabric ? `Fabric order #${order.number}` : `Order #${order.number}`;
  const subtitle = isFabric ? order.fabricListing?.name ?? "Fabric" : order.style?.name ?? "Custom outfit";

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={<span className="flex flex-wrap items-center gap-2">{subtitle} <OrderStatusBadge status={order.status} /> <DemoBadge show={order.isDemo} /></span>}
        back={{ href: `${base}/orders`, label: "Orders" }}
        actions={canSeeRequest ? <Link href={`/orders/${order.id}/messages`} className="btn-secondary">Messages</Link> : undefined}
      />

      {!assigned && !quoteOpen && (
        <p role="status" className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-700">
          This request is closed for your business ({labelOf(QUOTE_STATUS, quotes[quotes.length - 1]?.status).toLowerCase()}).
        </p>
      )}

      {/* ── What's needed to act now ── */}
      {fabricToConfirm && (
        <Section title="Confirm this fabric order">
          <p className="text-sm text-stone-700">
            The customer wants {order.fabricListing ? formatQty(order.fabricQtyCenti, order.fabricListing.unit) : "fabric"} of {order.fabricListing?.name ?? "your fabric"} for {formatMoney(order.totalMinor)}.
            The stock is reserved. Confirm you have it so the customer can pay, or decline to release it.
          </p>
          {!verified && <p className="text-sm text-amber-800">Your business must be verified before you can confirm orders.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <ActionForm action={fabricOrderRespondAction}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="decision" value="confirm" />
              <SubmitButton className="btn-primary w-full">I have it, confirm</SubmitButton>
            </ActionForm>
            <ActionForm action={fabricOrderRespondAction} className="space-y-2">
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="decision" value="reject" />
              <label className="label" htmlFor="fabric-reason">Reason for declining</label>
              <input id="fabric-reason" name="reason" maxLength={300} className="input" placeholder="e.g. sold out" />
              <ConfirmButton className="btn-danger w-full">Decline order</ConfirmButton>
            </ActionForm>
          </div>
        </Section>
      )}

      {needsQuoteForm && (
        <Section title="Send your quote">
          {!verified ? (
            <p className="text-sm text-amber-800">Your business must be verified by an administrator before it can send quotes.</p>
          ) : !manager ? (
            <p className="text-sm text-stone-600">Only owners and managers can send quotes. Ask a manager to reply.</p>
          ) : (
            <ActionForm action={submitQuoteAction}>
              <input type="hidden" name="quotationId" value={request!.id} />
              <QuoteFields
                prefix="quote" fabricFromBusiness={order.fabricSource === "BUSINESS"} listings={listings} defaultFabricQty={defaultFabricQty}
                defaultDepositPercent={Math.round(settings!.depositBps / 100)} minDate={minDate}
                defaults={{ completionDate: order.neededBy ? order.neededBy.toISOString().slice(0, 10) : undefined }}
              />
              <SubmitButton className="btn-primary w-full sm:w-auto" pendingText="Sending…">Send quote</SubmitButton>
            </ActionForm>
          )}
          {manager && (
            <details className="rounded-lg border border-stone-200 p-3">
              <summary className="cursor-pointer text-sm font-medium text-stone-700">Can&apos;t take this order?</summary>
              <ActionForm action={declineQuoteAction} className="mt-3 space-y-2">
                <input type="hidden" name="quotationId" value={request!.id} />
                <label className="label" htmlFor="decline-reason">Reason (shown to the customer)</label>
                <input id="decline-reason" name="reason" maxLength={500} className="input" placeholder="e.g. fully booked until next month" />
                <ConfirmButton>Decline request</ConfirmButton>
              </ActionForm>
            </details>
          )}
        </Section>
      )}

      {assigned && (steps.length > 0 || measuringHere || pickupHandover || pendingRevision || canRevise || (manager && CANCELLABLE.includes(order.status))) && (
        <Section title="Next steps">
          {!verified && <p className="text-sm text-amber-800">Your business must be verified to move orders forward.</p>}
          {steps.length > 0 && (
            <div className="space-y-3">
              {steps.includes("IN_PRODUCTION") && order.status === "MEASUREMENTS_CONFIRMED" && order.amountPaidMinor < order.depositMinor && (
                <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">
                  Waiting for the deposit ({formatMoney(order.depositMinor)}) before you can start sewing. Paid so far: {formatMoney(order.amountPaidMinor)}.
                </p>
              )}
              {steps.includes("MEASUREMENTS_CONFIRMED") && !order.measurementRecordId && (
                <p className="text-sm text-stone-600">Measurements are not attached yet{order.measurementMethod === "HOME_VISIT" ? "; the measurement professional will submit them after the visit" : ""}.</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {steps
                  .filter((s) => !(s === "MEASUREMENTS_CONFIRMED" && !order.measurementRecordId))
                  .map((s) => (
                    <ActionForm key={s} action={advanceOrderAction} className="space-y-2 rounded-lg border border-stone-200 p-3">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="to" value={s} />
                      <label className="label" htmlFor={`note-${s}`}>Note for the customer (optional)</label>
                      <input id={`note-${s}`} name="note" maxLength={300} className="input" />
                      <SubmitButton className={s === "AWAITING_MEASUREMENTS" || (s === "IN_PRODUCTION" && order.status === "QUALITY_CHECK") ? "btn-secondary w-full" : "btn-primary w-full"}>
                        {stepLabel(order.status, s)}
                      </SubmitButton>
                    </ActionForm>
                  ))}
              </div>
            </div>
          )}

          {measuringHere && (
            <div className="space-y-3 border-t border-stone-100 pt-4">
              <h3 className="font-semibold">Record measurements taken at your workshop</h3>
              <ActionForm action={workshopMeasurementsAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <div>
                  <label className="label" htmlFor="m-unit">Unit</label>
                  <select id="m-unit" name="unit" className="input sm:w-48" defaultValue="in">
                    {Object.entries(MEASUREMENT_UNITS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {(order.style?.measurementKeys ?? []).map((k) => (
                    <div key={k}>
                      <label className="label" htmlFor={`m_${k}`}>{labelOf(MEASUREMENT_FIELDS, k)}</label>
                      <input id={`m_${k}`} name={`m_${k}`} type="number" step="0.25" min="0" inputMode="decimal" className="input" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="label" htmlFor="m-notes">Notes (optional)</label>
                  <input id="m-notes" name="notes" maxLength={500} className="input" />
                </div>
                <SubmitButton>Save measurements</SubmitButton>
              </ActionForm>
            </div>
          )}

          {pickupHandover && (
            <div className="space-y-3 border-t border-stone-100 pt-4">
              <h3 className="font-semibold">Hand over at your workshop</h3>
              {order.amountPaidMinor < order.totalMinor ? (
                <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">
                  The customer still owes {formatMoney(order.totalMinor - order.amountPaidMinor)}. They must pay the balance in the app before you hand it over.
                </p>
              ) : (
                <p className="text-sm text-stone-600">Ask the customer for the 6-digit pickup code shown on their order, then enter it here.</p>
              )}
              <ActionForm action={markCollectedAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="orderId" value={order.id} />
                <div className="min-w-0 flex-1">
                  <label className="label" htmlFor="handover-code">Customer&apos;s pickup code</label>
                  <input id="handover-code" name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="off" className="input" />
                </div>
                <SubmitButton>Confirm handover</SubmitButton>
              </ActionForm>
            </div>
          )}
          {assigned && order.status === "READY" && order.fulfilment === "UNDECIDED" && (
            <p className="text-sm text-stone-600">Waiting for the customer to choose pickup or delivery.</p>
          )}

          {pendingRevision && (
            <div className="space-y-1 border-t border-stone-100 pt-4">
              <h3 className="font-semibold">Change waiting for the customer</h3>
              <p className="text-sm text-stone-700">
                New total {formatMoney(pendingRevision.totalMinor)} (currently {formatMoney(order.totalMinor)}). Nothing changes unless the customer approves it.
              </p>
            </div>
          )}

          {canRevise && manager && (
            <details className="border-t border-stone-100 pt-4">
              <summary className="cursor-pointer font-semibold">Propose a change to the price or date</summary>
              <ActionForm action={proposeRevisionAction} className="mt-3 space-y-4">
                <input type="hidden" name="orderId" value={order.id} />
                <div>
                  <label className="label" htmlFor="rev-reason">Why does the quote need to change?</label>
                  <textarea id="rev-reason" name="reason" required rows={2} maxLength={500} className="input" />
                </div>
                <QuoteFields
                  prefix="rev" fabricFromBusiness={order.fabricSource === "BUSINESS"} listings={listings} defaultFabricQty={defaultFabricQty}
                  defaultDepositPercent={order.totalMinor > 0 ? Math.round((order.depositMinor / order.totalMinor) * 100) : Math.round(settings!.depositBps / 100)}
                  minDate={minDate}
                  defaults={{ listingId: order.fabricListing?.id, completionDate: accepted?.completionDate ? accepted.completionDate.toISOString().slice(0, 10) : undefined }}
                />
                <SubmitButton className="btn-secondary">Send change to customer</SubmitButton>
              </ActionForm>
            </details>
          )}

          {manager && CANCELLABLE.includes(order.status) && (
            <details className="border-t border-stone-100 pt-4">
              <summary className="cursor-pointer text-sm font-medium text-red-700">Cancel this order</summary>
              <ActionForm action={businessCancelOrderAction} className="mt-3 space-y-2">
                <input type="hidden" name="orderId" value={order.id} />
                <p className="text-sm text-stone-600">Any payment is refunded to the customer under the cancellation policy. This can&apos;t be undone.</p>
                <label className="label" htmlFor="cancel-reason">Reason (shown to the customer)</label>
                <input id="cancel-reason" name="reason" required maxLength={300} className="input" />
                <ConfirmButton>Cancel order</ConfirmButton>
              </ActionForm>
            </details>
          )}
        </Section>
      )}

      {/* ── The order itself ── */}
      <Section title={isFabric ? "Fabric order" : "What the customer wants"}>
        {isFabric ? (
          <Dl
            items={[
              ["Fabric", order.fabricListing?.name ?? "—"],
              ["Quantity", order.fabricListing ? formatQty(order.fabricQtyCenti, order.fabricListing.unit) : "—"],
              ["Handover", order.parentOrderId ? "A rider delivers it to the customer's tailor" : order.fulfilment === "DELIVERY" ? "A rider delivers it to the customer" : "Customer collects from you"],
              ["Ordered", formatDate(order.createdAt)],
            ]}
          />
        ) : (
          <div className="space-y-4">
            {order.style && (
              <div className="flex items-start gap-3">
                <StyleImage icon={order.style.icon} imageUrl={order.style.imageUrl} className="h-16 w-16 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{order.style.name}</p>
                  <p className="text-sm text-stone-600">{order.style.category.name}</p>
                </div>
              </div>
            )}
            <Dl
              items={[
                ...choices,
                ["Fabric", FABRIC_SOURCE[order.fabricSource] ?? order.fabricSource],
                ["Measurements", labelOf(MEASUREMENT_METHODS, order.measurementMethod)],
                ["Needed by", order.neededBy ? formatDate(order.neededBy) : "No date given"],
                ["Requested", formatDate(order.createdAt)],
              ]}
            />
            {order.instructions && (
              <div>
                <p className="text-sm text-stone-500">Instructions</p>
                <p className="whitespace-pre-wrap break-words text-sm text-stone-900">{order.instructions}</p>
              </div>
            )}
            {canSeeRequest && order.referenceFileIds.length > 0 && (
              <div>
                <p className="mb-2 text-sm text-stone-500">Reference photos</p>
                <div className="flex flex-wrap gap-2">
                  {order.referenceFileIds.map((fid, i) => (
                    <a key={fid} href={privateUrl({ id: fid })} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={privateUrl({ id: fid })} alt={`Reference photo ${i + 1}`} className="h-24 w-24 rounded-lg border border-stone-200 object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}
            {assigned && order.fabricOrders.length > 0 && (
              <div>
                <p className="text-sm text-stone-500">Fabric bought from a seller for this order</p>
                <ul className="text-sm">
                  {order.fabricOrders.map((f) => <li key={f.id}>Fabric order #{f.number}: {labelOf(ORDER_STATUS, f.status)}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </Section>

      {assigned && (
        <Section title="Customer and payment">
          <Dl
            items={[
              ["Customer", customer?.name ?? "—"],
              ["Phone", customer?.phone ? <a href={`tel:${customer.phone.replace(/\s/g, "")}`} className="text-brand-700 hover:underline">{customer.phone}</a> : "—"],
              ["Total", formatMoney(order.totalMinor)],
              ["Deposit", formatMoney(order.depositMinor)],
              ["Paid", `${formatMoney(order.amountPaidMinor)} (${labelOf(PAYMENT_STATUS, order.paymentStatus)})`],
              ...(order.amountRefundedMinor > 0 ? [["Refunded", formatMoney(order.amountRefundedMinor)] as [string, string]] : []),
              ["Handover", order.fulfilment === "PICKUP" ? "Customer collects" : order.fulfilment === "DELIVERY" ? "Delivery by rider" : "Not chosen yet"],
              ...(accepted?.completionDate ? [["Promised for", formatDate(accepted.completionDate)] as [string, string]] : []),
              ...(order.cancelReason ? [["Cancellation reason", order.cancelReason] as [string, string]] : []),
            ]}
          />
          {deliveries.length > 0 && (
            <ul className="space-y-1 text-sm">
              {deliveries.map((d) => (
                <li key={d.id}>{labelOf(DELIVERY_LEGS, d.leg)}: {labelOf(DELIVERY_STATUS, d.status)}{d.attempt > 1 ? ` (attempt ${d.attempt})` : ""}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {assigned && !isFabric && (
        <Section title="Measurements">
          {appointments.length > 0 && (
            <ul className="space-y-1 text-sm">
              {appointments.map((a) => (
                <li key={a.id}>
                  {a.kind === "WORKSHOP" ? "Workshop visit" : "Home visit"} · {formatDateTime(a.windowStart)} · {labelOf(APPOINTMENT_STATUS, a.status)}
                  {a.professional ? ` · ${a.professional.name}` : ""}
                </li>
              ))}
            </ul>
          )}
          {measurement ? (
            <div className="space-y-2">
              <p className="text-sm text-stone-600">
                Revision {measurement.revision} · {measurement.source === "WORKSHOP" ? "taken at your workshop" : measurement.source === "PROFESSIONAL" ? "taken by a measurement professional" : "entered by the customer"} ·{" "}
                {measurement.status === "CONFIRMED" ? "confirmed" : measurement.status.toLowerCase()} · {formatDate(measurement.createdAt)}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                {Object.entries(measurementValues).map(([k, v]) => (
                  <div key={k} className="min-w-0">
                    <dt className="truncate text-stone-500">{labelOf(MEASUREMENT_FIELDS, k)}</dt>
                    <dd className="font-medium">{v.value} {v.unit}</dd>
                  </div>
                ))}
              </dl>
              {measurement.notes && <p className="break-words text-sm text-stone-600">Notes: {measurement.notes}</p>}
            </div>
          ) : (
            <p className="text-sm text-stone-600">No measurements attached yet.</p>
          )}
        </Section>
      )}

      {quotes.length > 0 && (
        <Section title="Your quotes">
          <ul className="space-y-4">
            {quotes.map((q) => (
              <li key={q.id} className="space-y-2 rounded-lg border border-stone-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{q.revisionOfId ? `Change (version ${q.version})` : isFabric ? "Listed price" : "Quote"}</p>
                  <Badge tone={q.status === "ACCEPTED" ? "green" : ["SUBMITTED", "REQUESTED"].includes(q.status) ? "gold" : "grey"}>{labelOf(QUOTE_STATUS, q.status)}</Badge>
                </div>
                {q.lines.length > 0 && (
                  <table className="w-full text-sm">
                    <tbody>
                      {q.lines.map((l) => (
                        <tr key={l.id} className="border-t border-stone-100">
                          <td className="py-1 pr-2 break-words">{l.description || labelOf(QUOTE_LINE_KINDS, l.kind)}</td>
                          <td className="py-1 text-right whitespace-nowrap">{formatMoney(l.amountMinor)}</td>
                        </tr>
                      ))}
                      <tr className="border-t border-stone-200 font-semibold">
                        <td className="py-1">Total</td>
                        <td className="py-1 text-right whitespace-nowrap">{formatMoney(q.totalMinor)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
                <p className="text-xs text-stone-500">
                  {q.totalMinor > 0 ? `Deposit ${formatMoney(q.depositMinor)}` : ""}
                  {q.completionDate ? ` · ready by ${formatDate(q.completionDate)}` : ""}
                  {q.validUntil && q.status === "SUBMITTED" ? ` · valid until ${formatDate(q.validUntil)}` : ""}
                </p>
                {q.message && <p className="whitespace-pre-wrap break-words text-sm text-stone-700">{q.message}</p>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {assigned && (
        <Section title="Timeline">
          {events.length === 0 ? (
            <p className="text-sm text-stone-600">No updates yet.</p>
          ) : (
            <ol className="space-y-3 border-l-2 border-stone-200 pl-4">
              {events.map((e) => (
                <li key={e.id} className="text-sm">
                  <p className="font-medium">{e.toStatus ? labelOf(ORDER_STATUS, e.toStatus) : e.type.charAt(0) + e.type.slice(1).toLowerCase()}</p>
                  {e.note && <p className="break-words text-stone-700">{e.note}</p>}
                  <p className="text-xs text-stone-500">{formatDateTime(e.createdAt)} · {e.actorRole.charAt(0) + e.actorRole.slice(1).toLowerCase()}</p>
                </li>
              ))}
            </ol>
          )}
        </Section>
      )}
    </div>
  );
}
