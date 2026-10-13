import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { pageOf } from "@/server/queries/admin";
import { requireAdminPage } from "../_lib/guard";
import { Pager, hrefWith } from "../_lib/ui";

export const metadata = { title: "Support" };
const PER_PAGE = 50;
const STATUS: Record<string, string> = { OPEN: "Waiting for us", ANSWERED: "Answered", CLOSED: "Closed" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireAdminPage("DISPUTES");
  const sp = await searchParams;
  const status = sp.status && sp.status in STATUS ? sp.status : sp.status === "ALL" ? "ALL" : "OPEN";
  const page = pageOf(sp.page);
  const rows = await db.supportTicket.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { updatedAt: status === "OPEN" ? "asc" : "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE + 1,
    select: { id: true, subject: true, status: true, updatedAt: true, orderId: true, user: { select: { name: true } }, _count: { select: { messages: true } } },
  });
  const tickets = rows.slice(0, PER_PAGE);
  const tabs: [string, string][] = [...Object.entries(STATUS), ["ALL", "All"]];

  return (
    <div className="space-y-6">
      <PageHeader title="Support requests" subtitle={status === "OPEN" ? "Waiting for a reply, longest waiting first." : undefined} />
      <nav aria-label="Filter by status" className="flex flex-wrap gap-2">
        {tabs.map(([k, l]) => (
          <Link key={k} href={hrefWith("/admin/support", {}, { status: k === "OPEN" ? undefined : k })} aria-current={status === k ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${status === k ? "border-brand-600 bg-brand-50 font-semibold text-brand-700" : "border-stone-300 bg-white text-stone-700"}`}>{l}</Link>
        ))}
      </nav>
      {tickets.length === 0 ? (
        <Empty title="Nothing here" />
      ) : (
        <div className="card">
          <ul className="divide-y divide-stone-100">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/support/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-stone-50">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{t.subject}</p>
                    <p className="text-sm text-stone-600">{t.user.name} · {t._count.messages} message{t._count.messages === 1 ? "" : "s"} · updated {formatDateTime(t.updatedAt)}{t.orderId ? " · about an order" : ""}</p>
                  </div>
                  <Badge tone={t.status === "OPEN" ? "gold" : t.status === "ANSWERED" ? "green" : "grey"}>{STATUS[t.status] ?? t.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
          <Pager base="/admin/support" params={{ status: status === "OPEN" ? undefined : status }} page={page} hasMore={rows.length > PER_PAGE} />
        </div>
      )}
    </div>
  );
}
