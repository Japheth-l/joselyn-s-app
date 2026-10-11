import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { BUSINESS_KINDS, VERIFICATION_LABELS } from "@/lib/constants";

const TABS = [
  { href: "/business", label: "Orders" },
  { href: "/business/stock", label: "Fabric stock" },
  { href: "/business/styles", label: "Styles & prices" },
  { href: "/business/profile", label: "Shop profile & location" },
];

export default async function BusinessLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("BUSINESS");
  const b = user.business!;
  const status = b.verificationStatus;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-stone-500">{BUSINESS_KINDS[b.kind as keyof typeof BUSINESS_KINDS]} portal</p>
        <h1 className="page-title">{b.name}</h1>
      </div>

      {status !== "VERIFIED" && (
        <div className={`rounded-xl p-4 text-sm ${status === "REJECTED" ? "bg-red-50 text-red-800" : "bg-gold-100 text-stone-800"}`}>
          <strong>Verification: {VERIFICATION_LABELS[status]}.</strong>{" "}
          {status === "REJECTED"
            ? "We couldn't verify your business. Please check your registration details and contact support."
            : "Our team is reviewing your registration. Meanwhile, add your fabric stock, styles and shop location. Clients will see you once you're verified."}
        </div>
      )}

      <nav className="flex flex-wrap gap-1 border-b border-stone-200 text-sm font-medium">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="rounded-t-lg px-4 py-2 text-stone-600 hover:bg-white hover:text-brand-700">
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
