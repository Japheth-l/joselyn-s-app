import Link from "next/link";
import { Badge, Empty, OrderStatusBadge, Section } from "@/components/ui/basics";
import { APPOINTMENT_STATUS, labelOf } from "@/lib/enums";
import { formatDateTime, formatTime } from "@/lib/time";
import { businessAppointments } from "@/server/services/appointments";
import { businessPage } from "@/server/queries/business";

export const metadata = { title: "Appointments" };

export default async function AppointmentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { actor } = await businessPage(id);
  const appointments = await businessAppointments(actor, id);
  const now = Date.now();
  const upcoming = appointments.filter((a) => a.windowEnd.getTime() >= now);
  const past = appointments.filter((a) => a.windowEnd.getTime() < now);

  const list = (items: typeof appointments) => (
    <ul className="divide-y divide-stone-100">
      {items.map((a) => (
        <li key={a.id} className="space-y-1 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{formatDateTime(a.windowStart)} – {formatTime(a.windowEnd)}</p>
            <Badge tone={a.kind === "WORKSHOP" ? "blue" : "grey"}>{a.kind === "WORKSHOP" ? "Workshop visit" : "Home measurement visit"}</Badge>
          </div>
          <p className="text-stone-700">
            {a.customer.name}
            {a.order && <> · <Link href={`/biz/${id}/orders/${a.order.id}`} className="text-brand-700 hover:underline">Order #{a.order.number}</Link></>}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-stone-600">
            {a.kind === "HOME_VISIT" ? labelOf(APPOINTMENT_STATUS, a.status) + (a.professional ? ` · ${a.professional.name}` : "") : "Booked by the customer"}
            {a.order && <OrderStatusBadge status={a.order.status} />}
          </p>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <Section title="Upcoming">
        {upcoming.length === 0 ? (
          <Empty title="No upcoming appointments">
            Customers who chose to be measured at your workshop book a visit from their order. Home measurement visits for your orders also appear here.
          </Empty>
        ) : list(upcoming)}
      </Section>
      {past.length > 0 && <Section title="Past, not yet closed">{list(past)}</Section>}
    </div>
  );
}
