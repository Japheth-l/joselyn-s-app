import "server-only";
import { db } from "./db";
import { PLATFORM_COMMISSION, SEARCH_RADIUS_KM } from "./constants";
import { distanceKm, formatCedis } from "./geo";
import { sendSms } from "./sms";

export type OrderEvent =
  | "placed" | "accepted" | "declined" | "cancelled" | "paid" | "measurer_assigned"
  | "measured" | "sewing" | "ready" | "picked_up" | "completed";

async function notify(user: { id: string; phone: string }, message: string, link: string, orderId: string, sms = true) {
  await db.notification.create({ data: { userId: user.id, orderId, message, link } });
  if (sms) await sendSms(user.phone, `Ntoma: ${message}`);
}

/** Tell verified agents of a role near a point that a new job is waiting. */
async function notifyNearbyAgents(role: "MEASURER" | "RIDER", lat: number, lng: number, message: string, orderId: string) {
  const agents = await db.user.findMany({ where: { role, verificationStatus: "VERIFIED" } });
  const link = role === "MEASURER" ? "/measurer" : "/rider";
  for (const a of agents) {
    if (a.lat == null || a.lng == null || distanceKm(lat, lng, a.lat, a.lng) <= SEARCH_RADIUS_KM) {
      await notify(a, message, link, orderId);
    }
  }
}

/** Send the right notifications (and create payouts) after an order changes. */
export async function orderEvent(orderId: string, event: OrderEvent) {
  const o = await db.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { client: true, business: { include: { owner: true } }, style: true, material: true, measurer: true, rider: true },
  });
  const item = o.kind === "SEW" ? o.style?.name ?? "outfit" : `${o.yards} yards of ${o.material?.name ?? "fabric"}`;
  const clientLink = `/orders/${o.id}`;
  const tellClient = (m: string) => notify(o.client, m, clientLink, o.id);
  const tellBusiness = (m: string) => notify(o.business.owner, m, "/business", o.id);

  switch (event) {
    case "placed":
      return tellBusiness(`New order: ${item} from ${o.client.name}. Please accept or decline.`);
    case "accepted":
      return tellClient(`${o.business.name} accepted your order for ${item}. Please pay ${formatCedis(o.total)} to continue.`);
    case "declined":
      return tellClient(`Sorry, ${o.business.name} couldn't take your order for ${item}. Please try another tailor.`);
    case "cancelled":
      return tellBusiness(`${o.client.name} cancelled their order for ${item}.`);
    case "paid": {
      await tellClient(`Payment of ${formatCedis(o.total)} received for ${item}. Thank you!`);
      await tellBusiness(`${o.client.name} has paid for ${item}. You can go ahead.`);
      if (o.status === "AWAITING_MEASUREMENT" && o.measurementMethod === "HOME_VISIT" && o.clientLat != null && o.clientLng != null) {
        await notifyNearbyAgents("MEASURER", o.clientLat, o.clientLng, `New measurement job near you (${formatCedis(o.measurementFee)}).`, o.id);
      }
      if (o.status === "READY" && o.fulfilment === "DELIVERY") {
        await notifyNearbyAgents("RIDER", o.business.lat, o.business.lng, `New delivery from ${o.business.name} (${formatCedis(o.deliveryFee)}).`, o.id);
      }
      return;
    }
    case "measurer_assigned":
      return tellClient(`${o.measurer?.name} will come to take your measurements${o.measurementTime ? ` on ${o.measurementTime.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })}` : ""}. Phone: ${o.measurer?.phone}.`);
    case "measured":
      await tellClient(`Your measurements for ${item} have been sent to ${o.business.name}.`);
      return tellBusiness(`Measurements for ${o.client.name}'s ${item} are ready. You can start sewing.`);
    case "sewing":
      return tellClient(`${o.business.name} has started sewing your ${item}.`);
    case "ready":
      if (o.fulfilment === "PICKUP") {
        return tellClient(`Your ${item} is ready! Pick it up at ${o.business.name}, ${o.business.address}.`);
      }
      await tellClient(`Your ${item} is ready. A rider will bring it to you soon.`);
      if (o.paymentStatus === "PAID") {
        await notifyNearbyAgents("RIDER", o.business.lat, o.business.lng, `New delivery from ${o.business.name} (${formatCedis(o.deliveryFee)}).`, o.id);
      }
      return;
    case "picked_up":
      return tellClient(`${o.rider?.name} is on the way with your ${item}. Phone: ${o.rider?.phone}.`);
    case "completed":
      await createPayouts(o.id);
      return tellClient(
        o.kind === "SEW"
          ? `Your ${item} has been ${o.fulfilment === "DELIVERY" ? "delivered" : "collected"}. Please rate ${o.business.name}!`
          : `Your fabric has been ${o.fulfilment === "DELIVERY" ? "delivered" : "collected"}. Enjoy!`,
      );
  }
}

/** Record what the platform owes each person who worked on a completed, paid order. */
export async function createPayouts(orderId: string) {
  const o = await db.order.findUniqueOrThrow({ where: { id: orderId }, include: { business: true } });
  if (o.status !== "COMPLETED" || o.paymentStatus !== "PAID") return;

  const rows = [
    { userId: o.business.ownerId, role: "BUSINESS", amount: Math.round((o.laborPrice + o.materialPrice) * (1 - PLATFORM_COMMISSION) * 100) / 100 },
    ...(o.measurerId && o.measurementFee > 0 ? [{ userId: o.measurerId, role: "MEASURER", amount: o.measurementFee }] : []),
    ...(o.riderId && o.deliveryFee > 0 ? [{ userId: o.riderId, role: "RIDER", amount: o.deliveryFee }] : []),
  ];
  for (const r of rows) {
    await db.payout.upsert({
      where: { orderId_userId: { orderId, userId: r.userId } },
      create: { orderId, ...r },
      update: {},
    });
  }
}

/**
 * Mark an order paid from a payment reference. `amountPaid` is what the provider
 * confirmed (null in demo mode). Safe to call more than once for the same payment.
 */
export async function markPaid(reference: string, amountPaid: number | null) {
  const o = await db.order.findUnique({ where: { paymentRef: reference } });
  if (!o) return { ok: false as const, reason: "Unknown payment reference" };
  if (o.paymentStatus === "PAID") return { ok: true as const, orderId: o.id };
  if (amountPaid != null && amountPaid + 0.005 < o.total) return { ok: false as const, reason: "Amount paid is less than the order total" };

  const res = await db.order.updateMany({
    where: { id: o.id, paymentStatus: "UNPAID" },
    data: { paymentStatus: "PAID", paidAt: new Date() },
  });
  if (res.count > 0) await orderEvent(o.id, "paid");
  return { ok: true as const, orderId: o.id };
}
