import type { ReactNode } from "react";
import { SubNav } from "@/components/ui/sub-nav";
import { requireActor } from "@/server/auth";

export default async function ProLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const kinds = actor.agents.map((a) => a.kind);
  const items = [
    { href: "/pro", label: "Overview", exact: true },
    ...(kinds.includes("MEASURER") ? [{ href: "/pro/measurements", label: "Measurement visits" }] : []),
    ...(kinds.includes("RIDER") ? [{ href: "/pro/deliveries", label: "Deliveries" }] : []),
    ...(kinds.length ? [{ href: "/pro/earnings", label: "Earnings" }] : []),
  ];
  return (
    <div className="mx-auto max-w-3xl">
      {items.length > 1 && <SubNav items={items} />}
      {children}
    </div>
  );
}
