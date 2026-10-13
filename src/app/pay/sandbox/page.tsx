import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { requireActor } from "@/server/auth";
import { approveSandboxAction } from "@/app/actions/orders";

export const metadata = { title: "Sandbox checkout" };

// Only exists in sandbox mode. Approving records a sandbox event that the normal verification path reads.
export default async function SandboxCheckout({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  if (process.env.PAYMENTS_MODE !== "sandbox") notFound();
  const actor = await requireActor();
  const { reference = "" } = await searchParams;
  const payment = await db.payment.findUnique({ where: { providerRef: reference }, include: { order: true } });
  if (!payment || payment.provider !== "SANDBOX" || payment.order.customerId !== actor.userId) notFound();
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div className="rounded-xl border-2 border-dashed border-gold-500 bg-gold-100 p-4 text-sm text-amber-900">
        <p className="font-bold">Sandbox checkout: no real money</p>
        <p>This is a test payment page. In live mode you'd pay by Mobile Money or card with Paystack.</p>
      </div>
      <div className="card space-y-3">
        <p className="text-sm text-stone-600">Order #{payment.order.number}</p>
        <p className="text-3xl font-bold">{formatMoney(payment.amountMinor)}</p>
        {payment.status === "PENDING" ? (
          <ActionForm action={approveSandboxAction}>
            <input type="hidden" name="reference" value={reference} />
            <SubmitButton className="btn-primary w-full">Approve test payment</SubmitButton>
          </ActionForm>
        ) : <p className="text-sm">This payment is {payment.status.toLowerCase()}.</p>}
        <Link href={`/orders/${payment.orderId}?payment=failed`} className="btn-secondary w-full">Cancel</Link>
      </div>
    </div>
  );
}
