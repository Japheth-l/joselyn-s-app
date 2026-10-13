import Link from "next/link";
import { ActionForm, ConfirmButton, SubmitButton } from "@/components/ui/action-form";
import { DemoBadge, PageHeader, Section } from "@/components/ui/basics";
import { confirmManualRefundAction, reconcileAction, recordPayoutAction } from "@/app/actions/admin";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { isAdmin } from "@/server/authz";
import { partyNames, userNames } from "@/server/queries/admin";
import { balancesOwed } from "@/server/services/payments";
import { requireAdminPage } from "../_lib/guard";
import { Table, Td } from "../_lib/ui";

export const metadata = { title: "Finance" };

const cedis = (minor: number) => (minor / 100).toFixed(2);

export default async function FinancePage() {
  const actor = await requireAdminPage("FINANCE");
  const [balances, refunds, payouts] = await Promise.all([
    balancesOwed(),
    db.refund.findMany({
      where: { status: { in: ["PROCESSING", "FAILED"] } }, orderBy: { createdAt: "asc" }, take: 200,
      include: { order: { select: { id: true, number: true, isDemo: true, customer: { select: { name: true, phone: true } } } }, payment: { select: { provider: true, providerRef: true } } },
    }),
    db.payout.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const parties = await partyNames([...balances, ...payouts]);
  const creators = await userNames(payouts.map((p) => p.createdById));
  const owed = balances.filter((b) => b.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor);
  const negative = balances.filter((b) => b.balanceMinor < 0);
  const processing = refunds.filter((r) => r.status === "PROCESSING");
  const failed = refunds.filter((r) => r.status === "FAILED");
  const orderLink = (o: { id: string; number: number }) => isAdmin(actor, "ORDERS") ? <Link href={`/admin/orders/${o.id}`} className="text-brand-700 hover:underline">#{o.number}</Link> : <>#{o.number}</>;
  const partyLabel = (t: string, id: string) => parties.get(`${t}:${id}`);

  return (
    <div className="space-y-6">
      <PageHeader title="Finance" subtitle="Balances owed to partners, refunds that need a person, and ledger checks." />

      <Section title="Ledger check">
        <p className="text-sm text-stone-600">Compares every successful payment with the ledger and looks for orders whose recorded paid amount or held balance is wrong. Each run is written to the audit log.</p>
        <ActionForm action={reconcileAction} className="space-y-3 break-words">
          <SubmitButton className="btn-secondary" pendingText="Checking…">Run reconciliation</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={`Owed to partners (${owed.length})`}>
        <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">
          Payouts are <strong>not</strong> sent automatically. Send the money by Mobile Money yourself, then record it here with the MoMo transaction ID.
          Recording it reduces the balance and tells the partner.
        </p>
        {owed.length === 0 ? <p className="text-sm text-stone-500">Nothing is owed right now.</p> : (
          <ul className="divide-y divide-stone-100">
            {owed.map((b) => {
              const p = partyLabel(b.partyType, b.partyId);
              const key = `${b.partyType}-${b.partyId}`;
              return (
                <li key={key} className="space-y-3 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words font-medium">{p?.name ?? "Unknown party"} <span className="text-sm font-normal text-stone-600">({b.partyType === "BUSINESS" ? "business" : "individual"})</span> <DemoBadge show={!!p?.isDemo} /></p>
                    <p className="text-lg font-bold tabular-nums">{formatMoney(b.balanceMinor)}</p>
                  </div>
                  <ActionForm action={recordPayoutAction} resetOnSuccess className="grid gap-3 sm:grid-cols-3 sm:items-end">
                    <input type="hidden" name="partyType" value={b.partyType} />
                    <input type="hidden" name="partyId" value={b.partyId} />
                    <div>
                      <label className="label" htmlFor={`amt-${key}`}>Amount sent (GH₵)</label>
                      <input id={`amt-${key}`} name="amount" inputMode="decimal" required defaultValue={cedis(b.balanceMinor)} className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor={`dest-${key}`}>Sent to (MoMo number)</label>
                      <input id={`dest-${key}`} name="destination" type="tel" required defaultValue={p?.phone ?? ""} className="input" />
                    </div>
                    <div>
                      <label className="label" htmlFor={`ref-${key}`}>MoMo transaction ID</label>
                      <input id={`ref-${key}`} name="reference" required maxLength={100} className="input" />
                    </div>
                    <div className="sm:col-span-3">
                      <ConfirmButton className="btn-primary" confirmText="Tap again to record the payout">Record payout</ConfirmButton>
                    </div>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        )}
        {negative.length > 0 && (
          <div className="space-y-1 text-sm text-red-800">
            <p className="font-semibold">Negative balances (partner owes the platform, e.g. a refund after settlement):</p>
            <ul className="list-inside list-disc">
              {negative.map((b) => <li key={`${b.partyType}-${b.partyId}`}>{partyLabel(b.partyType, b.partyId)?.name ?? "Unknown"}: {formatMoney(b.balanceMinor)}</li>)}
            </ul>
          </div>
        )}
      </Section>

      <Section title={`Refunds to send by Mobile Money (${processing.length})`}>
        <p className="text-sm text-stone-600">These refunds are against older (legacy) payments that have no provider record. Send the money to the customer by Mobile Money, then confirm with the transaction ID.</p>
        {processing.length === 0 ? <p className="text-sm text-stone-500">None waiting.</p> : (
          <ul className="divide-y divide-stone-100">
            {processing.map((r) => (
              <li key={r.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 break-words text-sm">Order {orderLink(r.order)} · {r.order.customer.name}{r.order.customer.phone ? ` · ${r.order.customer.phone}` : ""} <DemoBadge show={r.order.isDemo} /></p>
                  <p className="font-bold tabular-nums">{formatMoney(r.amountMinor)}</p>
                </div>
                <p className="break-words text-xs text-stone-500">{r.reason} · requested {formatDateTime(r.createdAt)}</p>
                <ActionForm action={confirmManualRefundAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <input type="hidden" name="refundId" value={r.id} />
                  <div className="flex-1">
                    <label className="label" htmlFor={`mref-${r.id}`}>MoMo transaction ID</label>
                    <input id={`mref-${r.id}`} name="reference" required maxLength={100} className="input" />
                  </div>
                  <ConfirmButton className="btn-primary" confirmText="Tap again to confirm">Confirm sent</ConfirmButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={`Failed refunds (${failed.length})`}>
        {failed.length === 0 ? <p className="text-sm text-stone-500">None.</p> : (
          <>
            <p className="text-sm text-stone-600">The payment provider did not accept these. No money moved and the order's refundable amount is unchanged, so you can issue the refund again from the order page.</p>
            <Table head={["Requested", "Order", "Amount", "Provider", "Reason"]}>
              {failed.map((r) => (
                <tr key={r.id}>
                  <Td>{formatDateTime(r.createdAt)}</Td><Td>{orderLink(r.order)}</Td><Td className="tabular-nums">{formatMoney(r.amountMinor)}</Td>
                  <Td>{r.payment?.provider ?? "—"}</Td><Td className="break-words">{r.reason}</Td>
                </tr>
              ))}
            </Table>
          </>
        )}
      </Section>

      <Section title="Recent payouts">
        {payouts.length === 0 ? <p className="text-sm text-stone-500">No payouts recorded yet.</p> : (
          <Table head={["When", "To", "Amount", "MoMo number", "Reference", "Recorded by"]}>
            {payouts.map((p) => (
              <tr key={p.id}>
                <Td>{formatDateTime(p.createdAt)}</Td><Td>{partyLabel(p.partyType, p.partyId)?.name ?? "Unknown"}</Td><Td className="tabular-nums">{formatMoney(p.amountMinor)}</Td>
                <Td>{p.destination}</Td><Td className="break-all">{p.reference}</Td><Td>{creators.get(p.createdById)?.name ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}
