import Link from "next/link";
import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md">
      <h1 className="page-title mb-6">Log in</h1>
      <LoginForm next={next ?? ""} />
      <p className="mt-4 text-sm text-stone-600">
        New here? <Link href="/signup" className="font-semibold text-brand-700">Create an account</Link>
      </p>
    </div>
  );
}
