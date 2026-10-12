import Link from "next/link";
import { Empty, PageHeader, VerificationBadge } from "@/components/ui/basics";
import { labelOf, MEMBERSHIP_ROLES } from "@/lib/enums";
import { requireActor } from "@/server/auth";

export const metadata = { title: "My businesses" };

export default async function MyBusinessesPage() {
  const actor = await requireActor();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="My businesses"
        actions={<Link href="/biz/new" className="btn-primary">Register a business</Link>}
      />
      {actor.memberships.length === 0 ? (
        <Empty title="You're not part of a business yet">
          Register your tailoring business or fabric shop, or ask the owner to add you to their team using your email ({actor.email}).
        </Empty>
      ) : (
        <ul className="space-y-3">
          {actor.memberships.map((m) => (
            <li key={m.businessId}>
              <Link href={`/biz/${m.businessId}`} className="card flex flex-wrap items-center justify-between gap-2 hover:border-brand-500">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.businessName}</span>
                  <span className="text-sm text-stone-600">{labelOf(MEMBERSHIP_ROLES, m.role)}</span>
                </span>
                <VerificationBadge status={m.verificationStatus} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
