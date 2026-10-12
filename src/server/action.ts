import "server-only";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ZodError } from "zod";
import type { Actor } from "./actor";
import { currentActor } from "./auth";
import { AppError } from "./errors";
import { log } from "./log";

export type ActionResult = { ok?: string; error?: string } | undefined;

/**
 * Wraps a server action body: requires a signed-in actor, turns known errors into a message
 * for the form, logs unexpected ones without leaking details, and lets redirects through.
 */
export async function run(fn: (actor: Actor) => Promise<string | void>): Promise<ActionResult> {
  try {
    const actor = await currentActor();
    if (!actor) return { error: "Please log in again." };
    const msg = await fn(actor);
    return { ok: msg || "Saved." };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Please check the form." };
    log.error("action.failed", { error: e instanceof Error ? e.message : String(e) });
    return { error: "Something went wrong. Please try again." };
  }
}
