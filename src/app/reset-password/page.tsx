import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { resetPasswordAction } from "../actions/auth";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <div className="mx-auto max-w-sm space-y-5">
      <h1 className="page-title">Choose a new password</h1>
      <ActionForm action={resetPasswordAction} className="card space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Repeat it</label>
          <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </div>
        <p className="text-xs text-stone-500">You'll be signed out on every device.</p>
        <SubmitButton className="btn-primary w-full">Save password</SubmitButton>
      </ActionForm>
    </div>
  );
}
