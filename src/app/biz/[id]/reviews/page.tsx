import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge, Empty, Section, Stars } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { atLeast, businessPage } from "@/server/queries/business";
import { respondToReviewAction } from "../../../actions/business";

export const metadata = { title: "Reviews" };

export default async function ReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, business } = await businessPage(id);
  const manager = atLeast(role, "MANAGER");
  const reviews = await db.review.findMany({
    where: { businessId: id, status: { in: ["PUBLISHED", "HIDDEN"] } },
    select: {
      id: true, rating: true, comment: true, status: true, businessResponse: true, respondedAt: true, createdAt: true,
      customer: { select: { name: true } }, order: { select: { number: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <Section title="Reviews" actions={<Stars rating={business.rating} count={business.reviewCount} />}>
      {reviews.length === 0 ? (
        <Empty title="No reviews yet">Customers can review an order after they confirm it&apos;s complete.</Empty>
      ) : (
        <ul className="divide-y divide-stone-100">
          {reviews.map((r) => (
            <li key={r.id} className="space-y-2 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span aria-label={`${r.rating} out of 5 stars`} className="text-gold-500">{"★".repeat(r.rating)}</span>
                  <span aria-hidden className="text-stone-300">{"★".repeat(5 - r.rating)}</span>
                  <span className="ml-2 font-medium">{r.customer.name.split(" ")[0]}</span>
                  <span className="text-stone-500"> · order #{r.order.number} · {formatDate(r.createdAt)}</span>
                </p>
                {r.status === "HIDDEN" && <Badge tone="red">Hidden by moderators</Badge>}
              </div>
              {r.comment ? <p className="whitespace-pre-wrap break-words text-sm text-stone-800">{r.comment}</p> : <p className="text-sm text-stone-500">No comment.</p>}
              {r.businessResponse ? (
                <div className="rounded-lg bg-stone-50 p-3 text-sm">
                  <p className="font-medium text-stone-700">Your response · {formatDate(r.respondedAt)}</p>
                  <p className="whitespace-pre-wrap break-words text-stone-800">{r.businessResponse}</p>
                </div>
              ) : manager ? (
                <ActionForm action={respondToReviewAction} className="space-y-2">
                  <input type="hidden" name="reviewId" value={r.id} />
                  <label className="label" htmlFor={`resp-${r.id}`}>Respond publicly (once)</label>
                  <textarea id={`resp-${r.id}`} name="response" required minLength={2} maxLength={1000} rows={2} className="input" />
                  <SubmitButton className="btn-secondary">Publish response</SubmitButton>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
