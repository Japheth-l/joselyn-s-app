import Link from "next/link";
import { AppError } from "@/server/errors";
import { verifyEmail } from "@/server/services/accounts";

export const metadata = { title: "Confirm email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  let message = "This confirmation link is missing its code.";
  let ok = false;
  if (token) {
    try {
      await verifyEmail(token);
      ok = true;
      message = "Thank you, your email address is confirmed.";
    } catch (e) {
      message = e instanceof AppError ? e.message : "We couldn't confirm your email. Please request a new link.";
    }
  }
  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <p className="text-3xl" aria-hidden>{ok ? "✅" : "⚠️"}</p>
      <p>{message}</p>
      <Link href="/account" className="btn-primary">Go to my account</Link>
    </div>
  );
}
