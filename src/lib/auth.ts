import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import type { Role } from "./constants";
import { SESSION_COOKIE, verifySession } from "./session";

/** The signed-in user, or null. Always re-read from the database so role and verification are current. */
export async function currentUser() {
  const store = await cookies();
  const session = await verifySession(store.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return db.user.findUnique({ where: { id: session.userId }, include: { business: true } });
}

/** Require a signed-in user, optionally with one of the given roles. */
export async function requireUser(...roles: Role[]) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role as Role)) redirect("/dashboard");
  return user;
}
