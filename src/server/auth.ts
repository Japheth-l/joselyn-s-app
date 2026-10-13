import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { PlatformRole } from "@/lib/enums";
import { loadActor, type Actor } from "./actor";
import { SESSION_COOKIE, readSession } from "./session";

/** The signed-in actor, re-read from the database once per request. */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const session = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return loadActor(session.userId, session.sv);
});

/** For pages: redirect to login when signed out. */
export async function requireActor(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  return actor;
}

/** For pages that belong to one platform role. */
export async function requirePageRole(role: PlatformRole): Promise<Actor> {
  const actor = await requireActor();
  if (!actor.roles.includes(role)) redirect("/account");
  return actor;
}
