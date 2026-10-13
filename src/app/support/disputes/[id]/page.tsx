import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Dl, PageHeader, Section } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { DISPUTE_CATEGORIES, DISPUTE_REMEDIES, DISPUTE_STATUS, labelOf } from "@/lib/enums";
import { formatDateTime } from "@/lib/time";
import { requireActor } from "@/server/auth";
import { AppError } from "@/server/errors";
import { privateUrl } from "@/server/files";
import { getDispute } from "@/server/services/community";
import { addDisputeNoteAction } from "../../../actions/account";
import { disputeTone } from "../../labels";

export const metadata = { title: "Dispute" };

export default async function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  // getDispute 404s strangers and hides internal notes from non-admins.
  const d = await getDispute(actor, id).catch((e) => {
    if (e instanceof AppError) return null;
    throw e;
  });
  if (!d) notFound();

  const authorIds = [...new Set(d.notes.map((n) => n.authorId))];
  const fileIds = [...new Set(d.notes.flatMap((n) => n.fileIds))];
  const [admins, members, files] = await Promise.all([
    authorIds.length ? db.roleAssignment.findMany({ where: { userId: { in: authorIds }, role: "ADMIN" }, select: { userId: true } }) : [],
    authorIds.length && d.order.businessId ? db.membership.findMany({ where: { userId: { in: authorIds }, businessId: d.order.businessId }, select: { userId: true } }) : [],
    fileIds.length ? db.storedFile.findMany({ where: { id: { in: fileIds } }, select: { id: true, mime: true } }) : [],
  ]);
  const adminIds = new Set(admins.map((a) => a.userId));
  const memberIds = new Set(members.map((m) => m.userId));
  const fileById = new Map(files.map((f) => [f.id, f]));
  const who = (authorId: string) =>
    authorId === actor.userId ? "You"
      : adminIds.has(authorId) ? `${BRAND.name} team`
      : authorId === d.order.customerId ? "Customer"
      : memberIds.has(authorId) ? d.order.business?.name ?? "Business"
      : "Participant";
  const closed = d.status === "RESOLVED" || d.status === "REJECTED";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={`Dispute #${d.number}`}
        subtitle={labelOf(DISPUTE_CATEGORIES, d.category)}
        back={{ href: "/support", label: "Help" }}
        actions={<Badge tone={disputeTone(d.status)}>{labelOf(DISPUTE_STATUS, d.status)}</Badge>}
      />

      <Section title="Details">
        <Dl items={[
          ["Order", <Link key="o" href={`/orders/${d.orderId}`} className="text-brand-700 underline">#{d.order.number}</Link>],
          ["Business", d.order.business?.name ?? "—"],
          ["Opened", formatDateTime(d.createdAt)],
          ["Status", labelOf(DISPUTE_STATUS, d.status)],
        ]} />
        <div>
          <p className="text-sm text-stone-500">What happened</p>
          <p className="whitespace-pre-wrap break-words text-sm text-stone-900">{d.description}</p>
        </div>
        <p className="text-xs text-stone-500">Our team reviews every dispute under the <Link href="/policies/refunds" className="underline">refunds and disputes policy</Link>. Any refund is paid back the way you paid.</p>
      </Section>

      {closed && (
        <Section title="Decision">
          <Dl items={[
            ["Outcome", labelOf(DISPUTE_STATUS, d.status)],
            ["Remedy", labelOf(DISPUTE_REMEDIES, d.remedy)],
            ["Decided", formatDateTime(d.resolvedAt)],
          ]} />
          {d.resolution && <p className="whitespace-pre-wrap break-words text-sm text-stone-900">{d.resolution}</p>}
        </Section>
      )}

      <Section title="Messages and evidence">
        {d.notes.length === 0 ? (
          <p className="text-sm text-stone-600">No messages yet.</p>
        ) : (
          <ol className="space-y-3">
            {d.notes.map((n) => (
              <li key={n.id} className={`rounded-xl border p-3 ${adminIds.has(n.authorId) ? "border-brand-100 bg-brand-50" : "border-stone-200 bg-white"}`}>
                <p className="text-xs font-semibold text-stone-600">{who(n.authorId)} · {formatDateTime(n.createdAt)}{n.internal ? " · internal" : ""}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-stone-900">{n.body}</p>
                {n.fileIds.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {n.fileIds.map((fid, i) => {
                      const f = fileById.get(fid);
                      if (!f) return null;
                      const isImage = f.mime.startsWith("image/");
                      return (
                        <li key={fid}>
                          <a href={privateUrl(f)} target="_blank" rel="noopener noreferrer" className="block rounded-lg border border-stone-200 p-1 text-xs text-brand-700 hover:bg-stone-50">
                            {isImage ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={privateUrl(f)} alt={`Attachment ${i + 1}`} className="h-20 w-20 rounded object-cover" />
                            ) : (
                              <span className="grid h-20 w-20 place-items-center text-center">📄 PDF {i + 1}</span>
                            )}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}

        {closed ? (
          <p className="text-sm text-stone-600">This dispute is closed. If you need more help, <Link href="/support" className="font-semibold text-brand-700 underline">contact us</Link>.</p>
        ) : (
          <ActionForm action={addDisputeNoteAction} resetOnSuccess className="space-y-3 border-t border-stone-100 pt-4">
            <input type="hidden" name="disputeId" value={d.id} />
            <div>
              <label className="label" htmlFor="body">Add a message</label>
              <textarea id="body" name="body" maxLength={3000} rows={4} className="input" placeholder="Anything our team should know" />
            </div>
            <div>
              <label className="label" htmlFor="evidence">Photos or documents (optional)</label>
              <input id="evidence" name="evidence" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="input min-h-11" />
              <p className="mt-1 text-xs text-stone-500">Up to 5 files of 5 MB. Seen only by the people in this dispute and our team.</p>
            </div>
            <SubmitButton className="btn-primary min-h-11 w-full sm:w-auto">Send</SubmitButton>
          </ActionForm>
        )}
      </Section>
    </div>
  );
}
