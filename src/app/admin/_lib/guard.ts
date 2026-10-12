import "server-only";
import { notFound } from "next/navigation";
import type { AdminPermission } from "@/lib/enums";
import { requireActor } from "@/server/auth";
import { isAdmin } from "@/server/authz";

/** For admin pages: signed in and holding the permission, otherwise a plain 404. */
export async function requireAdminPage(permission?: AdminPermission) {
  const actor = await requireActor();
  if (!isAdmin(actor, permission)) notFound();
  return actor;
}
