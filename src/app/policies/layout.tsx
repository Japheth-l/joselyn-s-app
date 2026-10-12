import Link from "next/link";

export default function PoliciesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <nav aria-label="Policies" className="flex flex-wrap gap-3 text-sm">
        <Link href="/policies/terms" className="text-brand-700 hover:underline">Terms of use</Link>
        <Link href="/policies/privacy" className="text-brand-700 hover:underline">Privacy</Link>
        <Link href="/policies/refunds" className="text-brand-700 hover:underline">Cancellations, refunds & disputes</Link>
      </nav>
      <article className="card space-y-4 text-sm leading-relaxed text-stone-700 [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-stone-900 [&_h2]:pt-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-stone-900 [&_li]:ml-5 [&_li]:list-disc">
        {children}
        <p className="border-t border-stone-100 pt-4 text-xs text-stone-500">
          This policy describes how the platform actually works. It has not yet been reviewed by a lawyer; it must be reviewed before the service is offered commercially.
        </p>
      </article>
    </div>
  );
}
