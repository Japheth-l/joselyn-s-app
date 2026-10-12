import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, Dl, OrderStatusBadge, PageHeader, Section } from "@/components/ui/basics";
import { addDisputeNoteAction, assignDisputeAction, resolveDisputeAction } from "@/app/actions/admin";
import { DISPUTE_CATEGORIES, DISPUTE_REMEDIES, DISPUTE_STATUS, ORDER_STATUS, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { isAdmin } from "@/server/authz";
import { privateUrl } from "@/server/files";
import { userNames } from "@/server/queries/admin";
import { getDispute } from "@/server/services/community";
import { requireAdminPage } from "../../_lib/guard";
import { Table, Td } from "../../_lib/ui";

export const metadata = { title: "Dispute" };

export default async function AdminDisputeDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("DISPUTES");
  const { id } = await params;
  const d = await getDispute(actor, id).catch(() => null);
  if (!d) notFound();
  const o = d.order;
  const names = await userNames(d.notes.map((n) => n.authorId));
  const files = d.notes.flatMap((n) => n.fileIds);
  const stored = files.length ? await db.storedFile.findMany({ where: { id: { in: files } }, select: { id: true, mime: true } }) : [];
  const mime = new Map(stored.map((f) => [f.id, f.mime]));
  const closed = d.status === "RESOLVED" || d.status === "REJECTED";
  const refundable = o.amountPaidMinor - o.amountRefundedMinor;
  const finance = isAdmin(actor, "FINANCE");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/disputes", label: "Disputes" }}
        title={`Dispute #${d.number}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{labelOf(DISPUTE_CATEGORIES, d.category)} <Badge tone={closed ? "grey" : d.status === "OPEN" ? "red" : "gold"}>{labelOf(DISPUTE_STATUS, d.status)}</Badge><DemoBadge show={o.isDemo} /></span>}
      />

      <Section title="Complaint">
        <Dl items={[
          ["Raised by", `${d.raisedBy.name}${d.raisedById === o.customerId ? " (customer)" : " (business)"}`],
          ["Raised", formatDateTime(d.createdAt)],
          ["Assigned to", d.assignedAdmin?.name ?? "Nobody yet"],
          ["Order", isAdmin(actor, "ORDERS") ? <Link key="o" href={`/admin/orders/${o.id}`} className="text-brand-700 hover:underline">#{o.number}</Link> : `#${o.number}`],
          ["Customer", o.customer.name],
          ["Business", o.business?.name ?? "—"],
          ["Order status", <OrderStatusBadge key="s" status={o.status} />],
          ["Status before dispute", labelOf(ORDER_STATUS, o.previousStatus)],
        ]} />
        <p className="whitespace-pre-line break-words rounded bg-stone-50 p-3 text-sm text-stone-800">{d.description}</p>
        {closed && (
          <Dl items={[
            ["Remedy", labelOf(DISPUTE_REMEDIES, d.remedy)],
            ["Closed", formatDateTime(d.resolvedAt)],
            ["Decision", d.resolution ?? "—"],
          ]} />
        )}
      </Section>

      <Section title="Money on this order">
        <Dl items={[
          ["Total", formatMoney(o.totalMinor)],
          ["Paid", formatMoney(o.amountPaidMinor)],
          ["Refunded", formatMoney(o.amountRefundedMinor)],
          ["Still refundable", <strong key="r">{formatMoney(refundable)}</strong>],
        ]} />
        {o.payments.length > 0 && (
          <Table head={["Created", "Amount", "Provider", "Reference", "Status"]}>
            {o.payments.map((p) => (
              <tr key={p.id}><Td>{formatDateTime(p.createdAt)}</Td><Td className="tabular-nums">{formatMoney(p.amountMinor)}</Td><Td>{p.provider}</Td><Td className="break-all">{p.providerRef}</Td><Td>{p.status.toLowerCase()}</Td></tr>
            ))}
          </Table>
        )}
        {o.refunds.length > 0 && (
          <Table head={["Created", "Refund", "Status", "Reason"]}>
            {o.refunds.map((r) => (
              <tr key={r.id}><Td>{formatDateTime(r.createdAt)}</Td><Td className="tabular-nums">{formatMoney(r.amountMinor)}</Td><Td>{r.status.toLowerCase()}</Td><Td className="break-words">{r.reason}</Td></tr>
            ))}
          </Table>
        )}
      </Section>

      <Section title="Notes and messages">
        {d.notes.length ? (
          <ol className="space-y-3">
            {d.notes.map((n) => (
              <li key={n.id} className={`rounded-lg border p-3 text-sm ${n.internal ? "border-gold-400 bg-gold-100/40" : "border-stone-200"}`}>
                <p className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
                  <span className="font-semibold text-stone-800">{names.get(n.authorId)?.name ?? "Unknown"}</span> {formatDateTime(n.createdAt)}
                  {n.internal && <Badge tone="gold">Internal: admins only</Badge>}
                </p>
                <p className="mt-1 whitespace-pre-line break-words">{n.body}</p>
                {n.fileIds.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-3">
                    {n.fileIds.map((f, i) => (
                      <li key={f}><a href={privateUrl({ id: f })} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Attachment {i + 1}{mime.get(f) === "application/pdf" ? " (PDF)" : ""}</a></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-stone-500">No notes yet.</p>}

        {!closed && (
          <ActionForm action={addDisputeNoteAction} resetOnSuccess className="space-y-3 border-t border-stone-200 pt-4">
            <input type="hidden" name="disputeId" value={d.id} />
            <div>
              <label className="label" htmlFor="body">Add a note</label>
              <textarea id="body" name="body" rows={3} required maxLength={3000} className="input" />
            </div>
            <div>
              <label className="label" htmlFor="evidence">Attachments (optional, up to 5 photos or PDFs, 5 MB each)</label>
              <input id="evidence" name="evidence" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm" />
            </div>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" name="internal" defaultChecked className="h-4 w-4" />
              Internal note (only administrators see it). Untick to message the customer and business.
            </label>
            <SubmitButton>Add note</SubmitButton>
          </ActionForm>
        )}
      </Section>

      {!closed && (
        <>
          <Section title="Status">
            <div className="flex flex-wrap gap-3">
              {(["UNDER_REVIEW", "AWAITING_PARTY"] as const).map((s) => (
                <ActionForm key={s} action={assignDisputeAction} className="space-y-2">
                  <input type="hidden" name="disputeId" value={d.id} />
                  <input type="hidden" name="status" value={s} />
                  <SubmitButton className={d.status === s ? "btn-secondary ring-2 ring-brand-500" : "btn-secondary"}>
                    {s === "UNDER_REVIEW" ? "Take it: under review" : "Waiting for a reply"}
                  </SubmitButton>
                </ActionForm>
              ))}
            </div>
            <p className="text-xs text-stone-500">Either button assigns the dispute to you.</p>
          </Section>

          <Section title="Resolve">
            <ActionForm action={resolveDisputeAction} className="space-y-4">
              <input type="hidden" name="disputeId" value={d.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="remedy">Remedy</label>
                  <select id="remedy" name="remedy" required className="input" defaultValue="NONE">
                    {Object.entries(DISPUTE_REMEDIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="refundAmount">Refund amount (GH₵, optional)</label>
                  <input id="refundAmount" name="refundAmount" inputMode="decimal" className="input" placeholder={`up to ${formatMoney(refundable)}`} disabled={!finance} />
                  <p className="mt-1 text-xs text-stone-500">{finance ? `Up to ${formatMoney(refundable)}. Required for a partial or full refund.` : "Refunds need the Finance permission as well."}</p>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="orderOutcome">What happens to the order</label>
                  <select id="orderOutcome" name="orderOutcome" required className="input" defaultValue="RESUME">
                    <option value="RESUME">Resume where it was ({labelOf(ORDER_STATUS, o.previousStatus ?? "COMPLETED")})</option>
                    <option value="COMPLETED">Mark completed (settles payment to the business and partners)</option>
                    <option value="CANCELLED">Cancel</option>
                    <option value="REFUNDED">Mark refunded</option>
                  </select>
                  {o.status !== "DISPUTED" && <p className="mt-1 text-xs text-stone-500">The order is no longer in dispute, so its status won't change.</p>}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="resolution">Decision (both parties see this)</label>
                <textarea id="resolution" name="resolution" rows={4} required minLength={10} maxLength={3000} className="input" />
              </div>
              <label className="flex min-h-10 items-center gap-2 text-sm">
                <input type="checkbox" name="reject" className="h-4 w-4" />
                Close without action (the complaint is not upheld)
              </label>
              <ConfirmButton className="btn-primary" confirmText="Tap again to close the dispute">Resolve dispute</ConfirmButton>
            </ActionForm>
          </Section>
        </>
      )}
    </div>
  );
}
