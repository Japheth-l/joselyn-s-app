import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, Section, VerificationBadge } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { labelOf, VERIFICATION_LABELS } from "@/lib/enums";
import { formatDate } from "@/lib/time";
import { privateUrl } from "@/server/files";
import { businessPage } from "@/server/queries/business";
import { resubmitVerificationAction } from "../../../actions/business";

export const metadata = { title: "Verification" };

export default async function VerificationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor, role, business } = await businessPage(id);
  const applications = await db.verificationApplication.findMany({ where: { businessId: id }, orderBy: { createdAt: "desc" } });
  // Documents are private: only link the ones this person uploaded (the file route enforces the same rule).
  const docIds = applications.flatMap((a) => a.documentIds);
  const myDocs = docIds.length
    ? new Set((await db.storedFile.findMany({ where: { id: { in: docIds }, ownerId: actor.userId }, select: { id: true } })).map((f) => f.id))
    : new Set<string>();
  const latest = applications[0] as (typeof applications)[number] | undefined;
  const canResubmit = role === "OWNER" && !["VERIFIED", "SUSPENDED"].includes(business.verificationStatus);

  return (
    <div className="space-y-6">
      <Section title="Status">
        <div className="flex flex-wrap items-center gap-2"><VerificationBadge status={business.verificationStatus} /></div>
        <p className="text-sm text-stone-600">
          {business.verificationStatus === "VERIFIED"
            ? "Your business is verified. Customers can find it, ask for quotes and buy your fabric."
            : business.verificationStatus === "SUSPENDED"
              ? "Your business is suspended. Customers can't find it and you can't take or fulfil orders. Contact support."
              : "An administrator checks your registration details and documents. Until your business is verified, customers can't find it and you can't send quotes or fulfil orders."}
        </p>
        <p className="text-sm text-stone-600">Registration / Ghana Card number on file: <span className="font-medium">{business.registrationNumber}</span></p>
      </Section>

      <Section title="Applications">
        {applications.length === 0 ? (
          <Empty title="No applications on record" />
        ) : (
          <ul className="divide-y divide-stone-100">
            {applications.map((a) => {
              const note = a.details && typeof a.details === "object" && "note" in a.details ? String((a.details as { note?: unknown }).note ?? "") : "";
              return (
                <li key={a.id} className="space-y-1 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">Submitted {formatDate(a.createdAt)}</p>
                    <Badge tone={a.status === "APPROVED" ? "green" : a.status === "REJECTED" ? "red" : "gold"}>{labelOf(VERIFICATION_LABELS, a.status)}</Badge>
                  </div>
                  {note && <p className="break-words text-stone-700">Your note: {note}</p>}
                  {a.decidedAt && <p className="text-stone-600">Decided {formatDate(a.decidedAt)}</p>}
                  {a.decisionNote && <p className="break-words rounded-lg bg-stone-50 p-2 text-stone-800">Reviewer: {a.decisionNote}</p>}
                  <p className="text-stone-600">
                    {a.documentIds.length === 0 ? "No documents attached." : `${a.documentIds.length} document${a.documentIds.length === 1 ? "" : "s"} attached`}
                    {a.documentIds.filter((d) => myDocs.has(d)).map((d, i) => (
                      <a key={d} href={privateUrl({ id: d })} target="_blank" rel="noreferrer" className="ml-2 text-brand-700 hover:underline">View {i + 1}</a>
                    ))}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {canResubmit ? (
        <Section title={latest?.status === "PENDING" ? "Add more information" : "Send for review again"}>
          <ActionForm action={resubmitVerificationAction} resetOnSuccess>
            <input type="hidden" name="businessId" value={id} />
            <div>
              <label className="label" htmlFor="note">Note for the reviewer</label>
              <textarea id="note" name="note" rows={3} maxLength={1000} className="input" placeholder="What you've changed or added" />
            </div>
            <div>
              <label className="label" htmlFor="documents">Documents</label>
              <input id="documents" name="documents" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="input" />
              <p className="mt-1 text-xs text-stone-500">JPG, PNG, WebP or PDF, up to 5 files of 5 MB each. Only reviewers can see them.</p>
            </div>
            <SubmitButton pendingText="Sending…">Send for review</SubmitButton>
          </ActionForm>
        </Section>
      ) : business.verificationStatus === "PENDING" && role !== "OWNER" ? (
        <p className="text-sm text-stone-600">Only the owner can send verification documents.</p>
      ) : null}
    </div>
  );
}
