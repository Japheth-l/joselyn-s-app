import Link from "next/link";
import { Badge, DemoBadge, Empty, PageHeader, Section } from "@/components/ui/basics";
import { VERIFICATION_LABELS, labelOf } from "@/lib/enums";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/time";
import { requireAdminPage } from "../_lib/guard";

export const metadata = { title: "Verifications" };

const SUBJECT: Record<string, string> = { BUSINESS: "Business", MEASURER: "Measurement professional", RIDER: "Delivery rider" };

type Row = Awaited<ReturnType<typeof load>>[number];
const load = (where: object, orderBy: object, take: number) =>
  db.verificationApplication.findMany({
    where, orderBy, take,
    select: {
      id: true, subjectType: true, status: true, createdAt: true, decidedAt: true,
      applicant: { select: { name: true, isDemo: true } }, business: { select: { name: true, city: true, isDemo: true } },
    },
  });

function List({ rows }: { rows: Row[] }) {
  return (
    <ul className="divide-y divide-stone-100">
      {rows.map((a) => (
        <li key={a.id}>
          <Link href={`/admin/verifications/${a.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-stone-50">
            <div className="min-w-0">
              <p className="break-words font-medium">{a.business?.name ?? a.applicant.name}</p>
              <p className="text-sm text-stone-600">
                {SUBJECT[a.subjectType] ?? a.subjectType}{a.business ? ` · ${a.business.city} · applied by ${a.applicant.name}` : ""} · {formatDateTime(a.createdAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <DemoBadge show={a.applicant.isDemo || !!a.business?.isDemo} />
              <Badge tone={a.status === "APPROVED" ? "green" : a.status === "REJECTED" ? "red" : "gold"}>{labelOf(VERIFICATION_LABELS, a.status)}</Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function VerificationsPage() {
  await requireAdminPage("VERIFY");
  const [open, decided] = await Promise.all([
    load({ status: { in: ["PENDING", "NEEDS_INFO"] } }, { createdAt: "asc" }, 200),
    load({ status: { in: ["APPROVED", "REJECTED"] } }, { decidedAt: "desc" }, 50),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Verifications" subtitle="Businesses, measurement professionals and riders waiting to be checked. Oldest first." />
      {open.length ? (
        <Section title={`Waiting (${open.length})`}><List rows={open} /></Section>
      ) : (
        <Empty title="Nothing waiting">New applications appear here.</Empty>
      )}
      <Section title="Recently decided">
        {decided.length ? <List rows={decided} /> : <p className="text-sm text-stone-500">No decisions yet.</p>}
      </Section>
    </div>
  );
}
