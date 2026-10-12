"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { AppError } from "@/server/errors";
import { clientIp, safeNext, str } from "@/server/forms";
import { log } from "@/server/log";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/server/session";
import { login, requestPasswordReset, resetPassword, sendVerificationEmail, signup } from "@/server/services/accounts";
import { currentActor } from "@/server/auth";
import type { ActionResult } from "@/components/ui/action-form";

// Public (signed-out) actions. They can't use run(), which requires a signed-in actor.
async function guard(fn: () => Promise<ActionResult | void>): Promise<ActionResult> {
  try {
    return (await fn()) ?? undefined;
  } catch (e) {
    const { isRedirectError } = await import("next/dist/client/components/redirect-error");
    if (isRedirectError(e)) throw e;
    if (e instanceof AppError) return { error: e.message };
    if (e instanceof ZodError) return { error: e.issues[0]?.message ?? "Please check the form." };
    log.error("auth_action.failed", { error: e instanceof Error ? e.message : String(e) });
    return { error: "Something went wrong. Please try again." };
  }
}

async function startSession(user: { id: string; sessionVersion: number }) {
  (await cookies()).set(SESSION_COOKIE, await signSession({ userId: user.id, sv: user.sessionVersion }), sessionCookieOptions);
}

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    const user = await login(str(fd, "email"), String(fd.get("password") ?? ""), await clientIp());
    await startSession(user);
    redirect(safeNext(str(fd, "next")));
  });
}

export async function signupAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    if (!fd.get("terms")) return { error: "Please accept the terms and privacy policy to continue." };
    const user = await signup({ name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone"), password: String(fd.get("password") ?? ""), city: str(fd, "city") }, await clientIp());
    await startSession(user);
    redirect(safeNext(str(fd, "next"), "/account?welcome=1"));
  });
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}

export async function forgotPasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    await requestPasswordReset(str(fd, "email"), await clientIp());
    return { ok: "If an account uses that email, we've sent a link to reset the password. It expires in one hour." };
  });
}

export async function resetPasswordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return guard(async () => {
    if (String(fd.get("password")) !== String(fd.get("confirm"))) return { error: "The two passwords don't match." };
    await resetPassword(str(fd, "token"), String(fd.get("password") ?? ""));
    redirect("/login?reset=1");
  });
}

export async function resendVerificationAction(): Promise<ActionResult> {
  return guard(async () => {
    const actor = await currentActor();
    if (!actor) return { error: "Please log in again." };
    const r = await sendVerificationEmail(actor.userId);
    if (r.reason === "already") return { ok: "Your email is already confirmed." };
    return r.sent ? { ok: "We've sent you a new confirmation link." } : { error: "Email sending isn't set up on this server yet, so we couldn't send the link. Please contact support." };
  });
}
