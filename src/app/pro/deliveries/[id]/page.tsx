import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, PageHeader, Section } from "@/components/ui/basics";
import { DELIVERY_LEGS, DELIVERY_STATUS, labelOf } from "@/lib/enums";
import { directionsUrl } from "@/lib/geo";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { AppError } from "@/server/errors";
import { getAssignmentForRider } from "@/server/services/deliveries";
import {
  markDeliveredAction, markInTransitAction, markPickedUpAction, releaseDeliveryAction, reportDeliveryFailureAction,
} from "../../../actions/pro";

export const metadata = { title: "Delivery" };

const FAIL_REASONS = {
  CUSTOMER_UNAVAILABLE: "Customer not available",
  WRONG_ADDRESS: "Wrong or unclear address",
  ITEM_NOT_READY: "Item wasn't ready at pickup",
  DAMAGED: "Item damaged",
  OTHER: "Something else",
} as const;

const tel = (phone: string) => `tel:${phone.replace(/\s+/g, "")}`;

export default async function ProDeliveryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ accepted?: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const sp = await searchParams;
  // Only the assigned rider gets the details back from the service.
  const a = await getAssignmentForRider(actor, id).catch((e) => {
    if (e instanceof AppError) return null;
    throw e;
  });
  if (!a) notFound();
  const live = ["ACCEPTED", "PICKED_UP", "IN_TRANSIT"].includes(a.status);
  const legacy = a.proofCodeHash === "LEGACY";
  const tone = a.status === "DELIVERED" ? "green" : a.status === "FAILED" || a.status === "CANCELLED" ? "red" : "blue";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Delivery for order #${a.order.number}`}
        subtitle={`${labelOf(DELIVERY_LEGS, a.leg)} · ${formatMoney(a.feeMinor)}`}
        back={{ href: "/pro/deliveries", label: "Deliveries" }}
        actions={<Badge tone={tone}>{labelOf(DELIVERY_STATUS, a.status)}</Badge>}
      />
      {sp.accepted && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Job accepted. Go to the pickup point and collect the item.</p>}

      {live ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="1. Pick up">
            <p className="break-words font-semibold">{a.pickupName}</p>
            <p className="break-words text-sm text-stone-600">{a.pickupAddress}</p>
            <div className="grid gap-2">
              <a href={directionsUrl(a.pickupLat, a.pickupLng)} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-11"><span aria-hidden>🗺️</span> Directions to pickup</a>
              {a.order.business?.phone && <a href={tel(a.order.business.phone)} className="btn-secondary min-h-11"><span aria-hidden>📞</span> Call {a.pickupName}</a>}
            </div>
          </Section>
          <Section title="2. Drop off">
            <p className="break-words font-semibold">{a.dropoffName}</p>
            <p className="break-words text-sm text-stone-600">{a.dropoffAddress || "No address text — call the customer."}</p>
            <div className="grid gap-2">
              <a href={directionsUrl(a.dropoffLat, a.dropoffLng)} target="_blank" rel="noopener noreferrer" className="btn-secondary min-h-11"><span aria-hidden>🗺️</span> Directions to drop-off</a>
              {a.order.customer.phone && <a href={tel(a.order.customer.phone)} className="btn-primary min-h-11"><span aria-hidden>📞</span> Call customer ({a.order.customer.phone})</a>}
            </div>
          </Section>
        </div>
      ) : (
        <Section title="Summary">
          <p className="text-sm text-stone-700">{a.pickupName} → {a.dropoffName}</p>
          {a.deliveredAt && <p className="text-sm text-stone-600">Delivered {formatDateTime(a.deliveredAt)}</p>}
          {a.status === "FAILED" && <p className="break-words text-sm text-stone-600">Reported problem: {a.failureReason ?? "—"}</p>}
          <p className="text-xs text-stone-500">Addresses and phone numbers are hidden once a delivery is finished.</p>
        </Section>
      )}

      {a.status === "ACCEPTED" && (
        <Section title="Collected the item?">
          <ActionForm action={markPickedUpAction}>
            <input type="hidden" name="assignmentId" value={a.id} />
            <SubmitButton className="btn-primary min-h-12 w-full text-base">I've picked it up</SubmitButton>
          </ActionForm>
        </Section>
      )}

      {a.status === "PICKED_UP" && (
        <Section title="On your way?">
          <ActionForm action={markInTransitAction}>
            <input type="hidden" name="assignmentId" value={a.id} />
            <SubmitButton className="btn-primary min-h-12 w-full text-base">I'm on the way</SubmitButton>
          </ActionForm>
          <p className="text-xs text-stone-500">We'll tell the customer you're coming.</p>
        </Section>
      )}

      {(a.status === "PICKED_UP" || a.status === "IN_TRANSIT") && (
        <Section title="Hand over">
          {legacy ? (
            <p className="text-sm text-stone-700">This delivery started before handover codes existed. After you hand over the item, ask the customer to confirm receipt in the app.</p>
          ) : (
            <ActionForm action={markDeliveredAction} className="space-y-3">
              <input type="hidden" name="assignmentId" value={a.id} />
              <div className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
                The customer has a 6-digit code in their order. The code proves you delivered. <strong>Hand over the item first</strong>, then ask for the code — never ask them to share it before they have it in their hands.
              </div>
              <div>
                <label className="label" htmlFor="code">Customer's 6-digit code</label>
                <input id="code" name="code" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" className="input min-h-12 text-center text-2xl tracking-[0.4em]" />
              </div>
              <SubmitButton className="btn-primary min-h-12 w-full text-base">Mark as delivered</SubmitButton>
            </ActionForm>
          )}
        </Section>
      )}

      {live && (
        <Section title="Something went wrong?">
          <details className="rounded-lg border border-stone-200 p-3">
            <summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-red-700">Delivery failed</summary>
            <ActionForm action={reportDeliveryFailureAction} className="mt-3 space-y-3">
              <input type="hidden" name="assignmentId" value={a.id} />
              <div>
                <label className="label" htmlFor="fail-reason">What happened?</label>
                <select id="fail-reason" name="reason" required defaultValue="" className="input min-h-11">
                  <option value="" disabled>Choose…</option>
                  {Object.entries(FAIL_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="fail-details">Details</label>
                <textarea id="fail-details" name="details" rows={2} maxLength={250} className="input" placeholder="e.g. called three times, no answer" />
              </div>
              <p className="text-xs text-stone-500">If you've already collected the item, return it to the pickup point.</p>
              <ConfirmButton className="btn-danger min-h-11 w-full sm:w-auto">Report failed delivery</ConfirmButton>
            </ActionForm>
          </details>
          {a.status === "ACCEPTED" && (
            <ActionForm action={releaseDeliveryAction} className="space-y-2">
              <input type="hidden" name="assignmentId" value={a.id} />
              <p className="text-sm text-stone-600">Can't do this job? Hand it back before pickup so another rider can take it.</p>
              <ConfirmButton className="btn-secondary min-h-11 w-full sm:w-auto">Hand back this job</ConfirmButton>
            </ActionForm>
          )}
        </Section>
      )}
    </div>
  );
}
