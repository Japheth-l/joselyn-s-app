import Link from "next/link";
import { Badge, DemoBadge, Empty, PageHeader } from "@/components/ui/basics";
import { DISPUTE_CATEGORIES, DISPUTE_STATUS, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { OPEN_DISPUTE_STATUSES, pageOf } from "@/server/queries/admin";
import { requireAdminPage } from "../_lib/guard";
import { Pager, hrefWith } from "../_lib/ui";

export const metadata = { title: "Disputes" };
const PER_PAGE = 50;

export default async function DisputesPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireAdminPage("DISPUTES");
  const sp = await searchParams;
  const status = sp.status === "ALL" ? "ALL" : sp.status && sp.status in DISPUTE_STATUS ? sp.status : "ACTIVE";
  const page = pageOf(sp.page);
  const where = status === "ALL" ? {} : status === "ACTIVE" ? { status: { in: OPEN_DISPUTE_STATUSES } } : { status };
  const rows = await db.dispute.findMany({
    where, orderBy: { createdAt: status === "ACTIVE" ? "asc" : "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE + 1,
    select: {
      id: true, number: true, status: true, category: true, createdAt: true,
      order: { select: { number: true, isDemo: true, business: { select: { name: true } } } },
      raisedBy: { select: { name: true } }, assignedAdmin: { select: { name: true } },
    },
  });
  const disputes = rows.slice(0, PER_PAGE);
  const tabs: [string, string][] = [["ACTIVE", "Needs action"], ...Object.entries(DISPUTE_STATUS), ["ALL", "All"]];

  return (
    <div className="space-y-6">
      <PageHeader title="Disputes" subtitle={status === "ACTIVE" ? "Open, under review or waiting for a reply. Oldest first." : undefined} />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <Link key={k} href={hrefWith("/admin/disputes", {}, { status: k === "ACTIVE" ? undefined : k })} aria-current={status === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === k ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-stone-300 bg-white text-stone-700"}`}>{l}</Link>
        ))}
      </nav>
      {disputes.length === 0 ? (
        <Empty title="No disputes here" />
      ) : (
        <div className="card">
          <ul className="divide-y divide-stone-100">
            {disputes.map((d) => (
              <li key={d.id}>
                <Link href={`/admin/disputes/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-stone-50">
                  <div className="min-w-0">
                    <p className="break-words font-medium">#{d.number} · {labelOf(DISPUTE_CATEGORIES, d.category)}</p>
                    <p className="break-words text-sm text-stone-600">Order #{d.order.number}{d.order.business ? ` · ${d.order.business.name}` : ""} · raised by {d.raisedBy.name} · {formatDateTime(d.createdAt)}</p>
                    <p className="text-xs text-stone-500">{d.assignedAdmin ? `Assigned to ${d.assignedAdmin.name}` : "Not assigned"}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={d.status === "OPEN" ? "red" : d.status === "RESOLVED" || d.status === "REJECTED" ? "grey" : "gold"}>{labelOf(DISPUTE_STATUS, d.status)}</Badge>
                    <DemoBadge show={d.order.isDemo} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager base="/admin/disputes" params={{ status: status === "ACTIVE" ? undefined : status }} page={page} hasMore={rows.length > PER_PAGE} />
        </div>
      )}
    </div>
  );
}
