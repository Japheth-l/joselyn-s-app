import type { AdminPermission, MembershipRole, PlatformRole } from "@/lib/enums";
import type { Actor } from "./actor";
import { forbidden } from "./errors";

// Every permission check lives here. Pages and services call these; hiding a button is never the control.

const RANK: Record<MembershipRole, number> = { STAFF: 1, MANAGER: 2, OWNER: 3 };

export function hasRole(actor: Actor, role: PlatformRole) {
  return actor.roles.includes(role);
}

export function isAdmin(actor: Actor, permission?: AdminPermission) {
  if (!actor.roles.includes("ADMIN")) return false;
  if (!permission) return true;
  return actor.adminPermissions.includes("SUPER") || actor.adminPermissions.includes(permission);
}

export function requireAdmin(actor: Actor, permission: AdminPermission) {
  if (!isAdmin(actor, permission)) throw forbidden("This needs an administrator permission you don't have.");
}

export function membershipRole(actor: Actor, businessId: string | null | undefined): MembershipRole | null {
  if (!businessId) return null;
  return actor.memberships.find((m) => m.businessId === businessId)?.role ?? null;
}

/** Throws unless the actor belongs to the business with at least `min` role. */
export function requireMember(actor: Actor, businessId: string, min: MembershipRole = "STAFF") {
  const role = membershipRole(actor, businessId);
  if (!role || RANK[role] < RANK[min]) throw forbidden("You don't have access to this business.");
  return role;
}

export function memberAtLeast(actor: Actor, businessId: string | null | undefined, min: MembershipRole) {
  const role = membershipRole(actor, businessId);
  return !!role && RANK[role] >= RANK[min];
}

export function agentStatus(actor: Actor, kind: "MEASURER" | "RIDER") {
  return actor.agents.find((a) => a.kind === kind)?.verificationStatus ?? null;
}

export function requireVerifiedAgent(actor: Actor, kind: "MEASURER" | "RIDER") {
  if (agentStatus(actor, kind) !== "VERIFIED") {
    throw forbidden(kind === "MEASURER" ? "Your measurement professional account must be verified first." : "Your rider account must be verified first.");
  }
}

/** Who the actor is in relation to an order. Empty array = no access. */
export type OrderRelation = "CUSTOMER" | "BUSINESS" | "MEASURER" | "RIDER" | "ADMIN";

export function orderRelations(
  actor: Actor,
  order: { customerId: string; businessId: string | null; quotationBusinessIds?: string[]; measurerIds?: string[]; riderIds?: string[] },
): OrderRelation[] {
  const rel: OrderRelation[] = [];
  if (order.customerId === actor.userId) rel.push("CUSTOMER");
  if (membershipRole(actor, order.businessId) || order.quotationBusinessIds?.some((id) => membershipRole(actor, id))) rel.push("BUSINESS");
  if (order.measurerIds?.includes(actor.userId)) rel.push("MEASURER");
  if (order.riderIds?.includes(actor.userId)) rel.push("RIDER");
  if (isAdmin(actor, "ORDERS") || isAdmin(actor, "DISPUTES") || isAdmin(actor, "FINANCE")) rel.push("ADMIN");
  return rel;
}
