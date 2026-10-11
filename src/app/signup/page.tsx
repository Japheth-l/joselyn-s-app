import Link from "next/link";
import { SignupForm } from "./signup-form";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="page-title mb-6">Create your account</h1>
      <SignupForm initialRole={role ?? "CLIENT"} />
      <p className="mt-4 text-sm text-stone-600">
        Already have an account? <Link href="/login" className="font-semibold text-brand-700">Log in</Link>
      </p>
    </div>
  );
}
