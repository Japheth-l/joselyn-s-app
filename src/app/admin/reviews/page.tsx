import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, DemoBadge, Empty, PageHeader, Section } from "@/components/ui/basics";
import { moderateReviewAction } from "@/app/actions/admin";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { requireAdminPage } from "../_lib/guard";

export const metadata = { title: "Reviews" };

const include = {
  business: { select: { name: true, isDemo: true } },
  customer: { select: { name: true } },
  order: { select: { number: true } },
  reports: { orderBy: { createdAt: "desc" as const }, take: 20 },
};
type Rv = Awaited<ReturnType<typeof db.review.findMany<{ include: typeof include }>>>[number];

function ReviewCard({ r }: { r: Rv }) {
  const open = r.reports.filter((x) => x.status === "OPEN");
  return (
    <li className="space-y-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words font-medium">{r.business.name} · <span aria-label={`${r.rating} out of 5 stars`}>{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span></p>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={r.status === "HIDDEN" ? "red" : "green"}>{r.status === "HIDDEN" ? "Hidden" : "Published"}</Badge>
          {open.length > 0 && <Badge tone="gold">{open.length} open report{open.length === 1 ? "" : "s"}</Badge>}
          <DemoBadge show={r.business.isDemo} />
        </div>
      </div>
      <p className="text-xs text-stone-500">By {r.customer.name} · order #{r.order.number} · {formatDateTime(r.createdAt)}</p>
      {r.comment ? <p className="whitespace-pre-line break-words text-sm">{r.comment}</p> : <p className="text-sm text-stone-500">No comment.</p>}
      {r.businessResponse && <p className="break-words border-l-2 border-stone-200 pl-3 text-sm text-stone-700">Business reply: {r.businessResponse}</p>}
      {r.reports.length > 0 && (
        <ul className="space-y-1 rounded bg-stone-50 p-2 text-sm">
          {r.reports.map((x) => (
            <li key={x.id} className="break-words"><span className="font-medium">{x.status.toLowerCase()}</span> · {formatDateTime(x.createdAt)}: {x.reason}</li>
          ))}
        </ul>
      )}
      <ActionForm action={moderateReviewAction} className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-end">
        <input type="hidden" name="reviewId" value={r.id} />
        <div>
          <label className="label" htmlFor={`status-${r.id}`}>Decision</label>
          <select id={`status-${r.id}`} name="status" defaultValue={open.length ? "HIDDEN" : r.status} className="input">
            <option value="PUBLISHED">Published (dismiss reports)</option>
            <option value="HIDDEN">Hidden (uphold reports)</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`note-${r.id}`}>Moderation note (audit log)</label>
          <input id={`note-${r.id}`} name="note" maxLength={500} className="input" />
        </div>
        <SubmitButton className="btn-secondary">Save</SubmitButton>
      </ActionForm>
    </li>
  );
}

export default async function ReviewsPage() {
  await requireAdminPage("DISPUTES");
  const [reported, recent] = await Promise.all([
    db.review.findMany({ where: { reports: { some: { status: "OPEN" } } }, include, orderBy: { createdAt: "asc" }, take: 100 }),
    db.review.findMany({ where: { reports: { none: { status: "OPEN" } } }, include, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" subtitle="Reported reviews first. Hiding a review removes it from the business's rating; reports are marked upheld or dismissed." />
      {reported.length ? (
        <Section title={`Reported (${reported.length})`}><ul className="divide-y divide-stone-100">{reported.map((r) => <ReviewCard key={r.id} r={r} />)}</ul></Section>
      ) : <Empty title="No open reports" />}
      <Section title="Recent reviews">
        {recent.length ? <ul className="divide-y divide-stone-100">{recent.map((r) => <ReviewCard key={r.id} r={r} />)}</ul> : <p className="text-sm text-stone-500">No reviews yet.</p>}
      </Section>
    </div>
  );
}
