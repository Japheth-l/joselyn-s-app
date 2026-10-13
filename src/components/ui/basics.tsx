import Link from "next/link";
import type { ReactNode } from "react";
import { labelOf, ORDER_STATUS } from "@/lib/enums";

export function PageHeader({ title, subtitle, back, actions }: { title: string; subtitle?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <div className="mb-6 space-y-1">
      {back && <Link href={back.href} className="text-sm font-medium text-brand-700 hover:underline">← {back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title break-words">{title}</h1>
          {subtitle && <div className="mt-1 text-sm text-stone-600">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card space-y-2 text-center">
      <p className="font-semibold text-stone-800">{title}</p>
      {children && <div className="text-sm text-stone-600">{children}</div>}
      {action && <div className="pt-2">{action}</div>}
    </div>
  );
}

export function Section({ title, children, actions, className = "" }: { title: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

const TONES = {
  green: "bg-brand-100 text-brand-700",
  gold: "bg-gold-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  grey: "bg-stone-100 text-stone-700",
  blue: "bg-sky-100 text-sky-800",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ children, tone = "grey" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  QUOTE_REQUESTED: "gold", QUOTED: "gold", AWAITING_PAYMENT: "gold", AWAITING_MEASUREMENTS: "gold",
  MEASUREMENTS_CONFIRMED: "blue", IN_PRODUCTION: "blue", QUALITY_CHECK: "blue", READY: "green",
  DELIVERY_ASSIGNED: "blue", PICKED_UP: "blue", IN_TRANSIT: "blue", DELIVERED: "green", COLLECTED: "green",
  COMPLETED: "green", CANCELLED: "grey", REFUNDED: "grey", DISPUTED: "red",
};

export function OrderStatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "grey"}>{labelOf(ORDER_STATUS, status)}</Badge>;
}

export function VerificationBadge({ status }: { status: string }) {
  const tone: Tone = status === "VERIFIED" ? "green" : status === "PENDING" || status === "NEEDS_INFO" ? "gold" : "red";
  const label = status === "VERIFIED" ? "✓ Verified" : status === "PENDING" ? "Awaiting verification" : status === "NEEDS_INFO" ? "More info needed" : status === "SUSPENDED" ? "Suspended" : "Not approved";
  return <Badge tone={tone}>{label}</Badge>;
}

export function DemoBadge({ show }: { show: boolean }) {
  return show ? <Badge tone="blue">Demo listing</Badge> : null;
}

export function Dl({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-stone-500">{k}</dt>
          <dd className="break-words font-medium text-stone-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Field({ label, name, hint, children }: { label: string; name?: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Stars({ rating, count }: { rating: number; count: number }) {
  if (count === 0) return <span className="text-sm text-stone-500">No reviews yet</span>;
  return <span className="text-sm text-stone-700"><span className="text-gold-500">★</span> {rating.toFixed(1)} <span className="text-stone-500">({count})</span></span>;
}
