import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { DISPUTE_CATEGORIES } from "@/lib/enums";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/basics";
import { requireActor } from "@/server/auth";
import { openDisputeAction } from "@/app/actions/orders";

export const metadata = { title: "Report a problem" };

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const order = await db.order.findFirst({ where: { id, customerId: actor.userId } });
  if (!order) notFound();
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={`Report a problem with #${order.number}`} back={{ href: `/orders/${id}`, label: "Back to the order" }} subtitle="Our team will review it, hear from the business, and decide a fair outcome. Money for an unfinished order stays held meanwhile." />
      <ActionForm action={openDisputeAction} className="card space-y-4">
        <input type="hidden" name="orderId" value={id} />
        <div>
          <label className="label" htmlFor="category">What's wrong?</label>
          <select id="category" name="category" required className="input" defaultValue="">
            <option value="" disabled>Choose…</option>
            {Object.entries(DISPUTE_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="description">Describe what happened</label>
          <textarea id="description" name="description" rows={6} minLength={20} maxLength={3000} required className="input" placeholder="What was agreed, what you received, and what you'd like to happen." />
        </div>
        <div>
          <label className="label" htmlFor="evidence">Photos or documents (optional, up to 5)</label>
          <input id="evidence" name="evidence" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm" />
        </div>
        <SubmitButton>Send to our team</SubmitButton>
      </ActionForm>
    </div>
  );
}
