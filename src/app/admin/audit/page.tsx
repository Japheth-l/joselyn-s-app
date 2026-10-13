import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Empty, PageHeader } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { pageOf, userNames } from "@/server/queries/admin";
import { requireAdminPage } from "../_lib/guard";
import { Pager } from "../_lib/ui";

export const metadata = { title: "Audit log" };
const PER_PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string; actor?: string; page?: string }> }) {
  await requireAdminPage("AUDIT");
  const sp = await searchParams;
  const action = (sp.action ?? "").trim().slice(0, 80);
  const actorEmail = (sp.actor ?? "").trim().toLowerCase().slice(0, 200);
  const page = pageOf(sp.page);

  let actorIds: string[] | null = null;
  if (actorEmail) {
    const users = await db.user.findMany({ where: { email: { contains: actorEmail, mode: "insensitive" } }, select: { id: true }, take: 50 });
    actorIds = users.map((u) => u.id);
  }
  const where: Prisma.AuditEventWhereInput = {
    ...(action ? { action: { startsWith: action } } : {}),
    ...(actorIds ? { actorId: { in: actorIds } } : {}),
  };
  const rows = await db.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE + 1 });
  const events = rows.slice(0, PER_PAGE);
  const names = await userNames(events.map((e) => e.actorId));

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" subtitle="Sensitive actions, newest first. Entries never contain passwords, tokens or measurement values." />
      <form method="get" className="card grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="action">Action starts with</label>
          <input id="action" name="action" defaultValue={action} className="input" placeholder="e.g. refund. or user." />
        </div>
        <div>
          <label className="label" htmlFor="actor">Actor email</label>
          <input id="actor" name="actor" defaultValue={actorEmail} className="input" placeholder="admin@…" />
        </div>
        <button type="submit" className="btn-primary">Filter</button>
        {(action || actorEmail) && <Link href="/admin/audit" className="btn-secondary">Clear</Link>}
      </form>
      {events.length === 0 ? (
        <Empty title="No matching entries" />
      ) : (
        <div className="card">
          <ul className="divide-y divide-stone-100">
            {events.map((e) => {
              const who = e.actorId ? names.get(e.actorId) : null;
              const data = e.data && typeof e.data === "object" && Object.keys(e.data as object).length ? JSON.stringify(e.data, null, 2) : null;
              return (
                <li key={e.id} className="space-y-1 py-3 text-sm">
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="break-all font-mono font-semibold">{e.action}</span>
                    <span className="text-stone-600">{formatDateTime(e.createdAt)}</span>
                  </p>
                  <p className="break-words text-stone-700">
                    By {who ? `${who.name} (${who.email})` : e.actorId ? "unknown user" : "the system"} · {e.entityType} <span className="break-all font-mono text-xs">{e.entityId}</span>
                  </p>
                  {data && (
                    <details>
                      <summary className="cursor-pointer text-xs text-brand-700">Details</summary>
                      <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-all rounded bg-stone-50 p-2 text-xs">{data}</pre>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
          <Pager base="/admin/audit" params={{ action: action || undefined, actor: actorEmail || undefined }} page={page} hasMore={rows.length > PER_PAGE} />
        </div>
      )}
    </div>
  );
}
