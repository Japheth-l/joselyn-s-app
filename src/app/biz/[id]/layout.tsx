import Link from "next/link";
import type { ReactNode } from "react";
import { DemoBadge, VerificationBadge } from "@/components/ui/basics";
import { SubNav } from "@/components/ui/sub-nav";
import { labelOf, MEMBERSHIP_ROLES } from "@/lib/enums";
import { businessCounts, businessPage, latestVerification } from "@/server/queries/business";

export default async function BusinessLayout({ children, params }: { children: ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { role, business } = await businessPage(id);
  const [counts, application] = await Promise.all([
    businessCounts(id),
    business.verificationStatus === "VERIFIED" ? null : latestVerification(id),
  ]);
  const base = `/biz/${id}`;
  const items = [
    { href: base, label: "Overview", exact: true },
    { href: `${base}/orders`, label: "Orders", count: counts.awaitingReply },
    { href: `${base}/inventory`, label: "Inventory" },
    { href: `${base}/styles`, label: "Styles" },
    { href: `${base}/appointments`, label: "Appointments" },
    { href: `${base}/reviews`, label: "Reviews" },
    { href: `${base}/finance`, label: "Finance" },
    { href: `${base}/team`, label: "Team" },
    { href: `${base}/profile`, label: "Profile" },
    { href: `${base}/verification`, label: "Verification" },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="page-title min-w-0 break-words">{business.name}</h1>
        <VerificationBadge status={business.verificationStatus} />
        <DemoBadge show={business.isDemo} />
        <span className="text-sm text-stone-500">You are {labelOf(MEMBERSHIP_ROLES, role).toLowerCase()}</span>
      </div>
      {business.verificationStatus !== "VERIFIED" && (
        <div role="note" className="mb-4 rounded-lg border border-gold-400 bg-gold-100 px-4 py-3 text-sm text-amber-900">
          {business.verificationStatus === "SUSPENDED" ? (
            <p>This business is suspended. Customers can&apos;t find it, and you can&apos;t send quotes or fulfil orders. Contact support if you think this is a mistake.</p>
          ) : business.verificationStatus === "REJECTED" ? (
            <p>Verification was not approved. Customers can&apos;t find this business, and you can&apos;t send quotes or fulfil orders until it is verified.</p>
          ) : (
            <p>
              Waiting for an administrator to verify this business. Until then customers can&apos;t find it, and you can&apos;t send quotes or fulfil orders.
              You can still set up your profile, styles and fabric.
            </p>
          )}
          {application?.status === "NEEDS_INFO" && <p className="mt-1 font-medium">More information is needed: {application.decisionNote || "see the verification page."}</p>}
          <Link href={`${base}/verification`} className="mt-1 inline-block font-semibold underline">Verification details</Link>
        </div>
      )}
      <SubNav items={items} />
      {children}
    </div>
  );
}
