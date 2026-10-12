"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Horizontally scrollable tabs for a portal section (stays inside the screen on phones). */
export function SubNav({ items }: { items: { href: string; label: string; exact?: boolean; count?: number }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Section" className="-mx-4 mb-6 overflow-x-auto border-b border-stone-200 px-4">
      <ul className="flex min-w-max gap-1">
        {items.map((i) => {
          const active = i.exact ? path === i.href : path === i.href || path.startsWith(i.href + "/");
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium ${active ? "border-brand-600 text-brand-700" : "border-transparent text-stone-600 hover:text-stone-900"}`}
              >
                {i.label}
                {i.count ? <span className="rounded-full bg-clay-500 px-1.5 text-[11px] font-bold text-white">{i.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
