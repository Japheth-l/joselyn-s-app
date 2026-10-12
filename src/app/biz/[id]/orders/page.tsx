import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, DemoBadge, Empty, OrderStatusBadge } from "@/components/ui/basics";
import { StyleImage, Swatch } from "@/components/swatch";
import { db } from "@/lib/db";
import { labelOf, MEASUREMENT_METHODS, PAYMENT_STATUS } from "@/lib/enums";
import { formatMoney } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import { formatDate } from "@/lib/time";
import {
  ACTIVE_STATUSES, businessPage, CLOSED_STATUSES, designLines, fabricToConfirmWhere, openQuoteRequestsWhere,
} from "@/server/queries/business";

export const metadata = { title: "Business orders" };

const TABS = [
  { key: "requests", label: "Quote requests" },
  { key: "quoted", label: "Quotes sent" },
  { key: "active", label: "Active orders" },
  { key: "closed", label: "Completed & cancelled" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const FABRIC_SOURCE: Record<string, string> = { OWN: "Customer brings fabric", BUSINESS: "Your fabric", SELLER: "Bought from a fabric seller" };

function Row({ href, children }: { href: string; children: ReactNode }) {
  return (
    <li>
      <Link href={href} className="card block space-y-2 p-4 hover:border-brand-500">{children}</Link>
    </li>
  );
}

export default async function BusinessOrdersPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  await businessPage(id);
  const tab: Tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as Tab) : "requests";
  const base = `/biz/${id}`;

  const [requestCount, fabricCount, quotedCount, activeCount] = await Promise.all([
    db.quotation.count({ where: openQuoteRequestsWhere(id) }),
    db.order.count({ where: fabricToConfirmWhere(id) }),
    db.quotation.count({ where: { businessId: id, status: "SUBMITTED", order: { kind: "CUSTOM" } } }),
    db.order.count({ where: { businessId: id, status: { in: ACTIVE_STATUSES } } }),
  ]);
  const counts: Partial<Record<Tab, number>> = { requests: requestCount + fabricCount, quoted: quotedCount, active: activeCount };

  let body: ReactNode;
  if (tab === "requests") {
    const [requests, fabric] = await Promise.all([
      db.quotation.findMany({
        where: openQuoteRequestsWhere(id),
        select: {
          id: true, createdAt: true,
          order: {
            select: {
              id: true, number: true, designChoices: true, neededBy: true, fabricSource: true, measurementMethod: true, isDemo: true, instructions: true,
              style: { select: { name: true, icon: true, imageUrl: true, options: { select: { key: true, label: true } } } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.order.findMany({
        where: fabricToConfirmWhere(id),
        select: { id: true, number: true, fabricQtyCenti: true, totalMinor: true, fulfilment: true, createdAt: true, isDemo: true, fabricListing: { select: { name: true, unit: true, fabricType: true, color: true, photos: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    body =
      requests.length + fabric.length === 0 ? (
        <Empty title="No requests waiting">When a customer asks you for a quote or orders your fabric, it appears here.</Empty>
      ) : (
        <div className="space-y-6">
          {fabric.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Fabric orders to confirm</h2>
              <ul className="space-y-3">
                {fabric.map((o) => (
                  <Row key={o.id} href={`${base}/orders/${o.id}`}>
                    <div className="flex items-start gap-3">
                      {o.fabricListing && <Swatch design={o.fabricListing.fabricType} color={o.fabricListing.color} imageUrl={o.fabricListing.photos[0]} className="h-12 w-12 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">Order #{o.number} · {o.fabricListing?.name ?? "Fabric"}</p>
                        <p className="text-sm text-stone-600">
                          {o.fabricListing ? formatQty(o.fabricQtyCenti, o.fabricListing.unit) : ""} · {formatMoney(o.totalMinor)} · {o.fulfilment === "DELIVERY" ? "Delivery" : "Pickup"}
                        </p>
                        <p className="text-xs text-stone-500">Ordered {formatDate(o.createdAt)}</p>
                      </div>
                      <DemoBadge show={o.isDemo} />
                    </div>
                  </Row>
                ))}
              </ul>
            </div>
          )}
          {requests.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-lg font-semibold">Quote requests</h2>
              <ul className="space-y-3">
                {requests.map((q) => {
                  const choices = designLines(q.order.designChoices, q.order.style?.options);
                  return (
                    <Row key={q.id} href={`${base}/orders/${q.order.id}`}>
                      <div className="flex items-start gap-3">
                        <StyleImage icon={q.order.style?.icon ?? "👗"} imageUrl={q.order.style?.imageUrl} className="h-12 w-12 shrink-0 text-2xl" />
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="font-semibold">Order #{q.order.number} · {q.order.style?.name ?? "Custom outfit"}</p>
                          {choices.length > 0 && <p className="break-words text-sm text-stone-700">{choices.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>}
                          <p className="text-sm text-stone-600">
                            {FABRIC_SOURCE[q.order.fabricSource] ?? q.order.fabricSource} · {labelOf(MEASUREMENT_METHODS, q.order.measurementMethod)}
                          </p>
                          <p className="text-xs text-stone-500">
                            Requested {formatDate(q.createdAt)}{q.order.neededBy ? ` · needed by ${formatDate(q.order.neededBy)}` : ""}
                          </p>
                        </div>
                        <DemoBadge show={q.order.isDemo} />
                      </div>
                    </Row>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      );
  } else if (tab === "quoted") {
    const quotes = await db.quotation.findMany({
      where: { businessId: id, status: "SUBMITTED", order: { kind: "CUSTOM" } },
      select: { id: true, totalMinor: true, validUntil: true, revisionOfId: true, respondedAt: true, order: { select: { id: true, number: true, status: true, isDemo: true, style: { select: { name: true } } } } },
      orderBy: { respondedAt: "desc" },
    });
    body =
      quotes.length === 0 ? (
        <Empty title="No quotes waiting for customers">Quotes you send stay here until the customer accepts or turns them down.</Empty>
      ) : (
        <ul className="space-y-3">
          {quotes.map((q) => (
            <Row key={q.id} href={`${base}/orders/${q.order.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 font-semibold">Order #{q.order.number} · {q.order.style?.name ?? "Custom outfit"}</p>
                {q.revisionOfId ? <Badge tone="gold">Change waiting for customer</Badge> : <Badge tone="gold">Waiting for customer</Badge>}
              </div>
              <p className="text-sm text-stone-700">
                {formatMoney(q.totalMinor)} · sent {formatDate(q.respondedAt)}{q.validUntil ? ` · valid until ${formatDate(q.validUntil)}` : ""}
              </p>
            </Row>
          ))}
        </ul>
      );
  } else {
    const orders = await db.order.findMany({
      where: { businessId: id, status: { in: tab === "active" ? ACTIVE_STATUSES : CLOSED_STATUSES } },
      select: {
        id: true, number: true, kind: true, status: true, paymentStatus: true, totalMinor: true, fulfilment: true, updatedAt: true, isDemo: true, fabricQtyCenti: true,
        style: { select: { name: true } }, fabricListing: { select: { name: true, unit: true } }, acceptedQuotation: { select: { completionDate: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: tab === "closed" ? 50 : 200,
    });
    body =
      orders.length === 0 ? (
        <Empty title={tab === "active" ? "No active orders" : "No completed or cancelled orders yet"}>
          {tab === "active" ? "Orders appear here once a customer accepts your quote or confirms a fabric purchase." : null}
        </Empty>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <Row key={o.id} href={`${base}/orders/${o.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 font-semibold">
                  Order #{o.number} · {o.kind === "FABRIC" ? `${o.fabricListing?.name ?? "Fabric"}${o.fabricListing ? `, ${formatQty(o.fabricQtyCenti, o.fabricListing.unit)}` : ""}` : o.style?.name ?? "Custom outfit"}
                </p>
                <div className="flex flex-wrap gap-1">
                  {o.kind === "FABRIC" && <Badge>Fabric</Badge>}
                  <OrderStatusBadge status={o.status} />
                  <DemoBadge show={o.isDemo} />
                </div>
              </div>
              <p className="text-sm text-stone-600">
                {formatMoney(o.totalMinor)} · {labelOf(PAYMENT_STATUS, o.paymentStatus)}
                {o.acceptedQuotation?.completionDate && tab === "active" ? ` · due ${formatDate(o.acceptedQuotation.completionDate)}` : ""}
                {o.fulfilment !== "UNDECIDED" ? ` · ${o.fulfilment === "PICKUP" ? "Pickup" : "Delivery"}` : ""}
              </p>
              <p className="text-xs text-stone-500">Updated {formatDate(o.updatedAt)}</p>
            </Row>
          ))}
        </ul>
      );
  }

  return (
    <div className="space-y-4">
      <nav aria-label="Order lists" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}/orders${t.key === "requests" ? "" : `?tab=${t.key}`}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${tab === t.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-stone-300 bg-white text-stone-700 hover:bg-stone-100"}`}
          >
            {t.label}
            {counts[t.key] ? <span className="rounded-full bg-stone-200 px-1.5 text-xs text-stone-800">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </nav>
      {body}
    </div>
  );
}
