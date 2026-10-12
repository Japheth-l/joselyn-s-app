import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { PageHeader } from "@/components/ui/basics";
import { requireActor } from "@/server/auth";
import { AppError } from "@/server/errors";
import { privateUrl } from "@/server/files";
import { conversationFor } from "@/server/services/community";
import { sendMessageAction } from "@/app/actions/orders";

export const dynamic = "force-dynamic";

// Shared by everyone on the order: customer, business, assigned professional and rider, and support staff.
export default async function MessagesPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let data;
  try {
    data = await conversationFor(actor, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const order = await db.order.findUniqueOrThrow({ where: { id }, select: { number: true, customerId: true, businessId: true } });
  const fileIds = data.messages.flatMap((m) => m.fileIds);
  const files = fileIds.length ? await db.storedFile.findMany({ where: { id: { in: fileIds } } }) : [];
  const back = order.customerId === actor.userId ? `/orders/${id}` : order.businessId && actor.memberships.some((m) => m.businessId === order.businessId) ? `/biz/${order.businessId}/orders/${id}` : "/account";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title={`Messages · order #${order.number}`} back={{ href: back, label: "Back to the order" }} subtitle="Everyone working on this order can read these messages, and so can our support team if there's a dispute." />
      <ol className="space-y-3">
        {data.messages.length === 0 && <li className="card text-sm text-stone-600">No messages yet.</li>}
        {data.messages.map((m) => {
          const mine = m.senderId === actor.userId;
          return (
            <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${mine ? "bg-brand-600 text-white" : "border border-stone-200 bg-white"}`}>
                <p className={`text-xs ${mine ? "text-brand-100" : "text-stone-500"}`}>{mine ? "You" : m.sender.name} · {formatDateTime(m.createdAt)}</p>
                {m.body && <p className="whitespace-pre-line break-words">{m.body}</p>}
                {m.fileIds.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {files.filter((f) => m.fileIds.includes(f.id)).map((f) => <a key={f.id} href={privateUrl(f)} target="_blank" rel="noopener noreferrer"><img src={privateUrl(f)} alt="Attachment" className="h-24 w-24 rounded-lg object-cover" /></a>)}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <ActionForm action={sendMessageAction} resetOnSuccess showSuccess={false} className="card sticky bottom-2 space-y-2">
        <input type="hidden" name="orderId" value={id} />
        <label htmlFor="body" className="sr-only">Message</label>
        <textarea id="body" name="body" rows={2} maxLength={2000} className="input" placeholder="Write a message" />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <input type="file" name="photo" multiple accept="image/jpeg,image/png,image/webp" aria-label="Attach photos" className="max-w-full text-xs" />
          <SubmitButton>Send</SubmitButton>
        </div>
      </ActionForm>
      <p className="text-center text-xs text-stone-500">Keep payments in the app. <Link href="/policies/terms" className="underline">Why?</Link></p>
    </div>
  );
}
