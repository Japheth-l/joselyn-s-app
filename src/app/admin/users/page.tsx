import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Badge, DemoBadge, Empty, PageHeader } from "@/components/ui/basics";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/time";
import { pageOf } from "@/server/queries/admin";
import { requireAdminPage } from "../_lib/guard";
import { Pager } from "../_lib/ui";

export const metadata = { title: "Users" };
const PER_PAGE = 50;

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  await requireAdminPage("USERS");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const page = pageOf(sp.page);
  const digits = q.replace(/[^0-9]/g, "");
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { phone: { contains: q } },
          ...(digits.length >= 4 && digits !== q ? [{ phone: { contains: digits } }] : []),
        ],
      }
    : {};
  const rows = await db.user.findMany({
    where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE + 1,
    select: { id: true, name: true, email: true, phone: true, status: true, isDemo: true, createdAt: true, roles: { select: { role: true } }, _count: { select: { memberships: true } } },
  });
  const users = rows.slice(0, PER_PAGE);

  return (
    <div className="space-y-6">
      <PageHeader title="Users" subtitle="Search by name, email or phone." />
      <form method="get" className="card flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={q} className="input" placeholder="Ama, ama@example.com, 024…" />
        </div>
        <button type="submit" className="btn-primary">Search</button>
        {q && <Link href="/admin/users" className="btn-secondary">Clear</Link>}
      </form>
      {users.length === 0 ? (
        <Empty title={q ? "No users match" : "No users yet"} />
      ) : (
        <div className="card">
          <ul className="divide-y divide-stone-100">
            {users.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-stone-50">
                  <div className="min-w-0">
                    <p className="break-words font-medium">{u.name}</p>
                    <p className="break-all text-sm text-stone-600">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                    <p className="text-xs text-stone-500">Joined {formatDate(u.createdAt)}{u._count.memberships ? ` · ${u._count.memberships} business${u._count.memberships === 1 ? "" : "es"}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.map((r) => <Badge key={r.role} tone={r.role === "ADMIN" ? "blue" : "grey"}>{r.role.toLowerCase()}</Badge>)}
                    {u.status !== "ACTIVE" && <Badge tone="red">{u.status.toLowerCase()}</Badge>}
                    <DemoBadge show={u.isDemo} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <Pager base="/admin/users" params={{ q: q || undefined }} page={page} hasMore={rows.length > PER_PAGE} />
        </div>
      )}
    </div>
  );
}
