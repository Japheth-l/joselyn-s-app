import { ORDER_STATUS, type OrderStatus } from "@/lib/constants";

const COLORS: Record<string, string> = {
  PLACED: "bg-gold-100 text-gold-500",
  AWAITING_MEASUREMENT: "bg-sky-100 text-sky-800",
  MEASURED: "bg-sky-100 text-sky-800",
  SEWING: "bg-violet-100 text-violet-800",
  READY: "bg-brand-100 text-brand-700",
  OUT_FOR_DELIVERY: "bg-brand-100 text-brand-700",
  COMPLETED: "bg-stone-200 text-stone-700",
  DECLINED: "bg-red-100 text-red-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${COLORS[status] ?? "bg-stone-100"}`}>{ORDER_STATUS[status as OrderStatus] ?? status}</span>;
}

type TimelineOrder = { kind: string; status: string; measurementMethod: string | null; fulfilment: string };

/** The stages this particular order goes through, based on the client's choices. */
export function orderStages(o: TimelineOrder): OrderStatus[] {
  const stages: OrderStatus[] = ["PLACED"];
  if (o.kind === "SEW") {
    if (o.measurementMethod !== "SELF") stages.push("AWAITING_MEASUREMENT");
    stages.push("MEASURED", "SEWING");
  }
  stages.push("READY");
  if (o.fulfilment === "DELIVERY") stages.push("OUT_FOR_DELIVERY");
  stages.push("COMPLETED");
  return stages;
}

export function Timeline({ order }: { order: TimelineOrder }) {
  if (order.status === "DECLINED" || order.status === "CANCELLED") return <StatusBadge status={order.status} />;
  const stages = orderStages(order);
  const current = stages.indexOf(order.status as OrderStatus);
  return (
    <ol className="space-y-3">
      {stages.map((s, i) => (
        <li key={s} className="flex items-center gap-3 text-sm">
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold ${i < current || s === "COMPLETED" && i === current ? "bg-brand-600 text-white" : i === current ? "bg-gold-400 text-stone-900" : "bg-stone-200 text-stone-500"}`}>
            {i < current || (s === "COMPLETED" && i === current) ? "✓" : i + 1}
          </span>
          <span className={i === current ? "font-semibold" : i > current ? "text-stone-400" : ""}>{ORDER_STATUS[s]}</span>
        </li>
      ))}
    </ol>
  );
}
