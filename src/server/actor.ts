import type { AdminPermission, MembershipRole, PlatformRole } from "@/lib/enums";
import { db } from "@/lib/db";

/** Everything authorisation needs to know about the signed-in person. */
export type Actor = {
  userId: string;
  name: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  isDemo: boolean;
  roles: PlatformRole[];
  adminPermissions: AdminPermission[];
  memberships: { businessId: string; role: MembershipRole; businessName: string; verificationStatus: string }[];
  agents: { kind: "MEASURER" | "RIDER"; verificationStatus: string }[];
};

export async function loadActor(userId: string, sessionVersion?: number): Promise<Actor | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { roles: true, memberships: { include: { business: true } }, agentProfiles: true },
  });
  if (!u || u.status !== "ACTIVE") return null;
  if (sessionVersion !== undefined && u.sessionVersion !== sessionVersion) return null;
  const admin = u.roles.find((r) => r.role === "ADMIN");
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    emailVerified: !!u.emailVerifiedAt,
    isDemo: u.isDemo,
    roles: u.roles.map((r) => r.role as PlatformRole),
    adminPermissions: (admin?.permissions ?? []) as AdminPermission[],
    memberships: u.memberships.map((m) => ({
      businessId: m.businessId,
      role: m.role as MembershipRole,
      businessName: m.business.name,
      verificationStatus: m.business.verificationStatus,
    })),
    agents: u.agentProfiles.map((a) => ({ kind: a.kind as "MEASURER" | "RIDER", verificationStatus: a.verificationStatus })),
  };
}
