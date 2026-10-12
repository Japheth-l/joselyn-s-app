import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { forgotPasswordAction } from "../actions/auth";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-sm space-y-5">
      <h1 className="page-title">Forgot your password?</h1>
      <ActionForm action={forgotPasswordAction} className="card space-y-4">
        <p className="text-sm text-stone-600">Enter your email and we'll send you a link to choose a new password.</p>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <SubmitButton className="btn-primary w-full">Send reset link</SubmitButton>
      </ActionForm>
    </div>
  );
}
