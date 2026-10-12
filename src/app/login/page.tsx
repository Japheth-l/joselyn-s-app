import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { currentActor } from "@/server/auth";
import { safeNext } from "@/server/forms";
import { loginAction } from "../actions/auth";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; reset?: string }> }) {
  const sp = await searchParams;
  if (await currentActor()) redirect(safeNext(sp.next));
  return (
    <div className="mx-auto max-w-sm space-y-5">
      <h1 className="page-title">Log in</h1>
      {sp.reset && <p role="status" className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-700">Your password was changed. Log in with the new one.</p>}
      <ActionForm action={loginAction} className="card space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full">Log in</SubmitButton>
        <p className="text-center text-sm"><Link href="/forgot-password" className="text-brand-700 hover:underline">Forgot your password?</Link></p>
      </ActionForm>
      <p className="text-center text-sm text-stone-600">New here? <Link href={`/signup${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`} className="font-semibold text-brand-700 hover:underline">Create an account</Link></p>
    </div>
  );
}
