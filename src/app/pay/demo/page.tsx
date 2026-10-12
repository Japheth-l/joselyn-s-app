import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCedis } from "@/lib/geo";
import { paymentsLive } from "@/lib/payments";
import { confirmDemoPayment } from "@/app/actions/orders";

// Simulated Mobile Money checkout, used only while PAYSTACK_SECRET_KEY is not set.
export default async function DemoPay({ searchParams }: { searchParams: Promise<{ reference?: string }> }) {
  const user = await requireUser("CLIENT");
  const { reference } = await searchParams;
  if (paymentsLive() || !reference) notFound();
  const o = await db.order.findFirst({ where: { paymentRef: reference, clientId: user.id }, include: { business: true } });
  if (!o) notFound();

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div className="rounded-lg bg-gold-100 p-3 text-center text-sm">Demo payment. No real money moves.</div>
      <div className="card space-y-4 text-center">
        <p className="text-4xl">📱</p>
        <h1 className="text-lg font-bold">Approve Mobile Money payment</h1>
        <p className="text-sm text-stone-600">
          A prompt has been sent to <strong>{user.phone}</strong>. Pay <strong>{formatCedis(o.total)}</strong> to Ntoma
          for your order with {o.business.name}.
        </p>
        <form action={confirmDemoPayment.bind(null, reference)}>
          <button className="btn-primary w-full">Approve payment</button>
        </form>
        <a href={`/orders/${o.id}`} className="block text-sm text-stone-500 hover:underline">Cancel</a>
      </div>
    </div>
  );
}
