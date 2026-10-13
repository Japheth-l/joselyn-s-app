import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, Dl, PageHeader, Section } from "@/components/ui/basics";
import { decideVerificationAction } from "@/app/actions/admin";
import { BUSINESS_KINDS, VERIFICATION_LABELS, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/time";
import { privateUrl } from "@/server/files";
import { userNames } from "@/server/queries/admin";
import { requireAdminPage } from "../../_lib/guard";
import { SubjectStatusForm } from "../../_lib/subject-status";
import { JsonDl } from "../../_lib/ui";

export const metadata = { title: "Verification" };

const SUBJECT: Record<string, string> = { BUSINESS: "Business", MEASURER: "Measurement professional", RIDER: "Delivery rider" };

export default async function VerificationDetail({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdminPage("VERIFY");
  const { id } = await params;
  const app = await db.verificationApplication.findUnique({
    where: { id },
    include: {
      applicant: { select: { id: true, name: true, email: true, phone: true, city: true, createdAt: true, status: true, isDemo: true, emailVerifiedAt: true } },
      business: { include: { members: { include: { user: { select: { name: true } } } } } },
    },
  });
  if (!app) notFound();
  const [docs, profile, history, names] = await Promise.all([
    app.documentIds.length ? db.storedFile.findMany({ where: { id: { in: app.documentIds } }, select: { id: true, mime: true, size: true, createdAt: true } }) : [],
    app.subjectType === "BUSINESS" ? null : db.agentProfile.findUnique({ where: { userId_kind: { userId: app.applicantId, kind: app.subjectType } } }),
    db.verificationApplication.findMany({
      where: { id: { not: app.id }, ...(app.businessId ? { businessId: app.businessId } : { applicantId: app.applicantId, subjectType: app.subjectType }) },
      orderBy: { createdAt: "desc" }, take: 10, select: { id: true, status: true, createdAt: true, decisionNote: true },
    }),
    userNames([app.reviewerId]),
  ]);
  const open = app.status === "PENDING" || app.status === "NEEDS_INFO";
  const own = app.applicantId === actor.userId;
  const b = app.business;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/verifications", label: "Verifications" }}
        title={b?.name ?? app.applicant.name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{SUBJECT[app.subjectType] ?? app.subjectType} · applied {formatDateTime(app.createdAt)} <Badge tone={app.status === "APPROVED" ? "green" : app.status === "REJECTED" ? "red" : "gold"}>{labelOf(VERIFICATION_LABELS, app.status)}</Badge><DemoBadge show={app.applicant.isDemo || !!b?.isDemo} /></span>}
      />

      <p className="rounded-lg bg-gold-100 px-3 py-2 text-sm text-amber-900">This page shows identity and registration numbers. Don't copy them anywhere else.</p>

      <Section title="Applicant">
        <Dl items={[
          ["Name", <Link key="u" href={`/admin/users/${app.applicant.id}`} className="text-brand-700 hover:underline">{app.applicant.name}</Link>],
          ["Email", <>{app.applicant.email} {app.applicant.emailVerifiedAt ? "(confirmed)" : "(not confirmed)"}</>],
          ["Phone", app.applicant.phone || "—"],
          ["City", app.applicant.city ?? "—"],
          ["Account status", app.applicant.status],
          ["Member since", formatDateTime(app.applicant.createdAt)],
        ]} />
      </Section>

      <Section title="Submitted details">
        <JsonDl value={app.details} />
      </Section>

      {b && (
        <Section title="Business">
          <Dl items={[
            ["Name", b.name],
            ["Kinds", b.kinds.map((k) => labelOf(BUSINESS_KINDS, k)).join(", ") || "—"],
            ["Registration number", b.registrationNumber || "—"],
            ["Phone", b.phone],
            ["Email", b.email ?? "—"],
            ["Address", `${b.address}, ${b.city}`],
            ["Location", `${b.lat.toFixed(4)}, ${b.lng.toFixed(4)}`],
            ["Service radius", `${b.serviceRadiusKm} km`],
            ["Capacity", `${b.capacityPerWeek} garments a week`],
            ["Skills", b.skills.join(", ") || "—"],
            ["Payout number (MoMo)", b.payoutPhone ?? "Not set"],
            ["Members", b.members.map((m) => `${m.user.name} (${m.role.toLowerCase()})`).join(", ")],
          ]} />
          {b.description && <p className="whitespace-pre-line break-words text-sm text-stone-700">{b.description}</p>}
        </Section>
      )}

      {profile && (
        <Section title="Professional profile">
          <Dl items={[
            ["Ghana Card", profile.ghanaCardNumber ?? "—"],
            ["Experience", profile.experience || "—"],
            ...(profile.vehicle ? [["Vehicle", profile.vehicle] as [string, string]] : []),
            ...(profile.feeMinor != null ? [["Home-visit fee", formatMoney(profile.feeMinor)] as [string, string]] : []),
            ["Service radius", `${profile.serviceRadiusKm} km`],
            ["Status", labelOf(VERIFICATION_LABELS, profile.verificationStatus)],
          ]} />
        </Section>
      )}

      <Section title={`Documents (${docs.length})`}>
        {docs.length ? (
          <ul className="space-y-2 text-sm">
            {docs.map((d, i) => (
              <li key={d.id}>
                <a href={privateUrl(d)} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">
                  Document {i + 1} ({d.mime === "application/pdf" ? "PDF, downloads" : "image"}, {Math.ceil(d.size / 1024)} KB)
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-stone-500">No documents were uploaded.</p>
        )}
        {docs.length < app.documentIds.length && <p className="text-xs text-red-700">{app.documentIds.length - docs.length} document(s) could not be found.</p>}
      </Section>

      <Section title="Decision">
        {!open ? (
          <Dl items={[
            ["Decision", labelOf(VERIFICATION_LABELS, app.status)],
            ["Decided", formatDateTime(app.decidedAt)],
            ["By", (app.reviewerId && names.get(app.reviewerId)?.name) || "—"],
            ["Note", app.decisionNote || "—"],
          ]} />
        ) : own ? (
          <p className="text-sm text-stone-700">This is your own application; another administrator must decide it.</p>
        ) : (
          <ActionForm action={decideVerificationAction} className="space-y-4">
            <input type="hidden" name="applicationId" value={app.id} />
            {app.status === "NEEDS_INFO" && app.decisionNote && <p className="text-sm text-stone-600">Earlier request for information: “{app.decisionNote}”</p>}
            <fieldset className="space-y-2">
              <legend className="label">Decision</legend>
              {([["APPROVED", "Approve"], ["NEEDS_INFO", "Ask for more information"], ["REJECTED", "Reject"]] as const).map(([v, l]) => (
                <label key={v} className="flex min-h-10 items-center gap-2 text-sm">
                  <input type="radio" name="decision" value={v} required className="h-4 w-4" /> {l}
                </label>
              ))}
            </fieldset>
            <div>
              <label className="label" htmlFor="note">Note to the applicant (required unless approving)</label>
              <textarea id="note" name="note" rows={3} maxLength={1000} className="input" />
            </div>
            <ConfirmButton className="btn-primary" confirmText="Tap again to record the decision">Record decision</ConfirmButton>
          </ActionForm>
        )}
      </Section>

      {(b || profile) && (
        <Section title="Suspend or reinstate">
          {b && <SubjectStatusForm subjectType="BUSINESS" subjectId={b.id} status={b.verificationStatus} name={b.name} />}
          {profile && <SubjectStatusForm subjectType={app.subjectType as "MEASURER" | "RIDER"} subjectId={app.applicantId} status={profile.verificationStatus} name={`${app.applicant.name} · ${SUBJECT[app.subjectType]}`} />}
        </Section>
      )}

      {history.length > 0 && (
        <Section title="Earlier applications">
          <ul className="divide-y divide-stone-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="py-2">
                <Link href={`/admin/verifications/${h.id}`} className="font-medium text-brand-700 hover:underline">{formatDateTime(h.createdAt)}</Link> · {labelOf(VERIFICATION_LABELS, h.status)}
                {h.decisionNote && <span className="block break-words text-stone-600">{h.decisionNote}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
