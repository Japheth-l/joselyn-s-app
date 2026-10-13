import Link from "next/link";
import type { ReactNode } from "react";

/** Build a URL keeping the current filters and replacing some of them. */
export function hrefWith(base: string, params: Record<string, string | undefined>, change: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...change })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export function Pager({ base, params, page, hasMore }: { base: string; params: Record<string, string | undefined>; page: number; hasMore: boolean }) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2 pt-2 text-sm">
      {page > 1 ? <Link className="btn-secondary" href={hrefWith(base, params, { page: page === 2 ? undefined : String(page - 1) })}>← Newer</Link> : <span />}
      <span className="text-stone-600">Page {page}</span>
      {hasMore ? <Link className="btn-secondary" href={hrefWith(base, params, { page: String(page + 1) })}>Older →</Link> : <span />}
    </nav>
  );
}

/** Simple count tile. Shows the recorded number only. */
export function Stat({ label, value, href }: { label: string; value: ReactNode; href?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-1 break-words text-xl font-bold text-stone-900">{value}</div>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-lg border border-stone-200 bg-stone-50 p-3 hover:border-brand-500">{body}</Link>
  ) : (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">{body}</div>
  );
}

/** Renders an arbitrary JSON object as a definition list (values stringified). */
export function JsonDl({ value }: { value: unknown }) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded bg-stone-50 p-2 text-xs">{JSON.stringify(value, null, 2)}</pre>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return <p className="text-sm text-stone-500">No details.</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-stone-500">{k}</dt>
          <dd className="break-words font-medium text-stone-900">{v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A table that scrolls sideways inside its card on narrow screens instead of widening the page. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
          <tr>{head.map((h) => <th key={h} scope="col" className="py-2 pr-3 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-stone-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return <td className={`py-2 pr-3 align-top ${className}`}>{children}</td>;
}
