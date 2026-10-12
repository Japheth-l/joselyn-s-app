import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { CITIES } from "@/lib/enums";
import { currentActor } from "@/server/auth";
import { signupAction } from "../actions/auth";

export const metadata = { title: "Create an account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  if (await currentActor()) redirect("/account");
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="page-title">Create your account</h1>
        <p className="mt-1 text-sm text-stone-600">Everyone starts with a customer account. You can register a business, or apply to measure or deliver, from your account afterwards.</p>
      </div>
      <ActionForm action={signupAction} className="card space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" name="name" autoComplete="name" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="phone">Phone (for SMS updates)</label>
          <input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="024 123 4567" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="city">City</label>
          <select id="city" name="city" required className="input" defaultValue="">
            <option value="" disabled>Choose…</option>
            {Object.keys(CITIES).map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
          <p className="mt-1 text-xs text-stone-500">At least 8 characters.</p>
        </div>
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" name="terms" required className="mt-1" />
          <span>I agree to the <Link href="/policies/terms" className="text-brand-700 underline">terms</Link> and <Link href="/policies/privacy" className="text-brand-700 underline">privacy policy</Link>.</span>
        </label>
        <SubmitButton className="btn-primary w-full">Create account</SubmitButton>
      </ActionForm>
      <p className="text-center text-sm text-stone-600">Already have an account? <Link href="/login" className="font-semibold text-brand-700 hover:underline">Log in</Link></p>
    </div>
  );
}
