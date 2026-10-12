import crypto from "crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { formatMoney, parseCedis } from "@/lib/money";
import { parseQty, priceForQty } from "@/lib/qty";
import { addDays, parseLocalDate, parseLocalDateTime } from "@/lib/time";
import type { Actor } from "../actor";
import { membershipRole, requireMember } from "../authz";
import { conflict, forbidden, invalid, notFound } from "../errors";
import { consumeOrderReservations, releaseOrderReservations, reserveStock } from "../inventory";
import { notify, notifyBusiness, notifyMany } from "../notifications";
import { orderEvent, requireOrderAccess, transition } from "../order-flow";
import { WORK_STARTED } from "../order-machine";
import { buildQuoteLines, deliveryFeeBetween } from "../pricing";
import { rateLimit } from "../rate-limit";
import { getSettings } from "../settings";
import { validateDesignChoices } from "./catalogue";
import { addRecord, checkRequired, ensureProfile, type MeasurementValues } from "./measurements";

type Tx = Prisma.TransactionClient;

export function hashCode(orderOrAssignmentId: string, code: string) {
  return crypto.createHash("sha256").update(`${orderOrAssignmentId}:${code}`).digest("hex");
}
export function newHandoverCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Payment status follows from the amounts; it is never set directly by a person. */
export function paymentStatusFor(o: { totalMinor: number; depositMinor: number; amountPaidMinor: number; amountRefundedMinor: number }) {
  if (o.amountRefundedMinor > 0) return o.amountRefundedMinor >= o.amountPaidMinor ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (o.totalMinor > 0 && o.amountPaidMinor >= o.totalMinor) return "PAID";
  if (o.depositMinor > 0 && o.amountPaidMinor >= o.depositMinor) return "DEPOSIT_PAID";
  return "UNPAID";
}

// ───────────── Custom (tailoring) orders ─────────────

export const customOrderSchema = z.object({
  styleId: z.string().min(1),
  designChoices: z.record(z.string(), z.string()).default({}),
  instructions: z.string().trim().max(2000).default(""),
  referenceFileIds: z.array(z.string()).max(5).default([]),
  budget: z.string().optional(),
  neededBy: z.string().optional(),
  fabricSource: z.enum(["OWN", "BUSINESS", "SELLER"]),
  measurementMethod: z.enum(["SAVED", "SELF", "HOME_VISIT", "AT_WORKSHOP"]),
  measurementRecordId: z.string().optional(),
  profileId: z.string().optional(),
  measurements: z.record(z.string(), z.object({ value: z.number(), unit: z.enum(["in", "cm"]) })).optional(),
  visitStart: z.string().optional(),
  visitEnd: z.string().optional(),
  addressText: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  businessIds: z.array(z.string()).min(1, "Choose at least one business to ask for a quote").max(5, "Ask up to five businesses at once"),
});

/** Create a custom order and ask the chosen businesses for quotations. */
export async function createCustomOrder(actor: Actor, input: z.input<typeof customOrderSchema>) {
  const d = customOrderSchema.parse(input);
  const settings = await getSettings();
  const style = await db.style.findFirst({ where: { id: d.styleId, status: "PUBLISHED" }, include: { options: true } });
  if (!style) throw notFound("Style");
  const designChoices = validateDesignChoices(style.options, d.designChoices);
  const budgetMinor = d.budget ? parseCedis(d.budget) : null;
  if (d.budget && (budgetMinor == null || budgetMinor <= 0)) throw invalid("Enter your budget in cedis.");
  const neededBy = d.neededBy ? parseLocalDate(d.neededBy) : null;
  if (d.neededBy && (!neededBy || neededBy < addDays(new Date(), 1))) throw invalid("Choose a completion date from tomorrow onwards.");

  const businesses = await db.business.findMany({ where: { id: { in: d.businessIds } }, include: { styles: { where: { styleId: style.id } } } });
  for (const id of d.businessIds) {
    const b = businesses.find((x) => x.id === id);
    if (!b) throw notFound("Business");
    if (b.verificationStatus !== "VERIFIED") throw invalid(`${b.name} isn't verified yet, so it can't take orders.`);
    if (b.styles.length === 0) throw invalid(`${b.name} doesn't sew this style.`);
  }

  if (d.measurementMethod === "HOME_VISIT") {
    if (d.lat == null || d.lng == null || !d.addressText) throw invalid("Share your location and enter an address or landmark for the measurement visit.");
    const s = d.visitStart ? parseLocalDateTime(d.visitStart) : null;
    const e = d.visitEnd ? parseLocalDateTime(d.visitEnd) : null;
    if (!s || !e || e <= s) throw invalid("Choose a start and end time for the visit window.");
    if (s < new Date(Date.now() + 2 * 3_600_000)) throw invalid("Choose a visit time at least two hours from now.");
    if (e.getTime() - s.getTime() > 8 * 3_600_000) throw invalid("Keep the visit window to eight hours or less.");
  }

  const order = await db.$transaction(async (tx) => {
    let measurementRecordId: string | null = null;
    if (d.measurementMethod === "SAVED") {
      const rec = await tx.measurementRecord.findFirst({
        where: { id: d.measurementRecordId ?? "", profile: { ownerId: actor.userId }, status: { in: ["SUBMITTED", "CONFIRMED"] } },
      });
      if (!rec) throw invalid("Choose one of your saved measurement records.");
      checkRequired(rec.values as MeasurementValues, style.measurementKeys);
      if (rec.status !== "CONFIRMED") await tx.measurementRecord.update({ where: { id: rec.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
      measurementRecordId = rec.id;
    } else if (d.measurementMethod === "SELF") {
      const values = d.measurements ?? {};
      checkRequired(values, style.measurementKeys);
      const profile = await ensureProfile(tx, actor.userId, d.profileId);
      measurementRecordId = (await addRecord(tx, { profileId: profile.id, values, source: "SELF", status: "CONFIRMED", createdById: actor.userId })).id;
    }

    const o = await tx.order.create({
      data: {
        kind: "CUSTOM", status: "DRAFT", customerId: actor.userId, styleId: style.id, designChoices, instructions: d.instructions,
        referenceFileIds: d.referenceFileIds, fabricSource: d.fabricSource, budgetMinor, neededBy, measurementMethod: d.measurementMethod,
        measurementRecordId, addressText: d.addressText ?? null, lat: d.lat ?? null, lng: d.lng ?? null,
        fabricQtyCenti: d.fabricSource === "OWN" ? 0 : style.fabricQtyCenti, isDemo: actor.isDemo,
      },
    });
    await tx.storedFile.updateMany({ where: { id: { in: d.referenceFileIds }, ownerId: actor.userId }, data: { orderId: o.id } });

    if (d.measurementMethod === "HOME_VISIT") {
      const profile = await ensureProfile(tx, actor.userId, d.profileId);
      await tx.appointment.create({
        data: {
          kind: "HOME_VISIT", customerId: actor.userId, orderId: o.id, profileId: profile.id,
          windowStart: parseLocalDateTime(d.visitStart!)!, windowEnd: parseLocalDateTime(d.visitEnd!)!,
          addressText: d.addressText, lat: d.lat, lng: d.lng, feeMinor: settings.homeMeasurementFeeMinor,
        },
      });
    }

    for (const b of d.businessIds) {
      await tx.quotation.create({ data: { orderId: o.id, businessId: b, status: "REQUESTED" } });
    }
    await transition(tx, { orderId: o.id, from: "DRAFT", to: "QUOTE_REQUESTED", actorId: actor.userId, as: "CUSTOMER", note: `Quotes requested from ${d.businessIds.length} business(es)` });
    return o;
  });

  for (const b of d.businessIds) {
    await notifyBusiness(b, "quote.requested", { order: order.number, item: style.name }, { link: `/biz/${b}/orders/${order.id}`, orderId: order.id });
  }
  return order;
}

/** Ask more businesses while the order is still collecting quotes. */
export async function requestMoreQuotes(actor: Actor, orderId: string, businessIds: string[]) {
  const { order } = await requireOrderAccess(db, actor, orderId, ["CUSTOMER"]);
  if (!["QUOTE_REQUESTED", "QUOTED"].includes(order.status)) throw invalid("This order is no longer collecting quotes.");
  const existing = new Set(order.quotations.map((q) => q.businessId));
  const fresh = businessIds.filter((id) => !existing.has(id));
  if (existing.size + fresh.length > 8) throw invalid("An order can ask at most eight businesses.");
  for (const id of fresh) {
    const b = await db.business.findUnique({ where: { id }, include: { styles: { where: { styleId: order.styleId ?? "" } } } });
    if (!b || b.verificationStatus !== "VERIFIED" || b.styles.length === 0) throw invalid("One of those businesses can't take this order.");
    await db.quotation.create({ data: { orderId, businessId: id, status: "REQUESTED" } });
    await notifyBusiness(id, "quote.requested", { order: order.number, item: "a custom order" }, { link: `/biz/${id}/orders/${orderId}`, orderId });
  }
}

export const quoteSchema = z.object({
  labour: z.string().min(1, "Enter your price for sewing"),
  fabricListingId: z.string().optional(),
  fabricQty: z.string().optional(),
  otherAmount: z.string().optional(),
  otherDescription: z.string().trim().max(80).optional(),
  discount: z.string().optional(),
  completionDate: z.string().min(1, "Choose the completion date"),
  depositPercent: z.coerce.number().int().min(0).max(100).optional(),
  message: z.string().trim().max(1000).default(""),
});

/** Build quotation figures from a business's form, adding the platform's measurement and service fees. */
async function prepareQuote(tx: Tx, order: { id: string; fabricSource: string; measurementMethod: string | null; fabricQtyCenti: number }, businessId: string, input: z.input<typeof quoteSchema>) {
  const d = quoteSchema.parse(input);
  const settings = await getSettings();
  const labour = parseCedis(d.labour);
  if (labour == null) throw invalid("Enter your sewing price in cedis.");
  const completion = parseLocalDate(d.completionDate);
  if (!completion || completion < addDays(new Date(), 1)) throw invalid("Choose a completion date from tomorrow onwards.");

  let fabricMinor = 0;
  let fabricQtyCenti: number | null = null;
  let fabricListingId: string | null = null;
  let fabricDescription = "Fabric";
  if (order.fabricSource === "BUSINESS") {
    const listing = await tx.fabricListing.findFirst({ where: { id: d.fabricListingId ?? "", businessId, status: "ACTIVE" } });
    if (!listing) throw invalid("Choose which of your fabrics you'll use.");
    const qty = parseQty(d.fabricQty ?? "");
    if (!qty) throw invalid("Enter how much fabric the outfit needs.");
    if (listing.qtyOnHandCenti - listing.qtyReservedCenti < qty) throw conflict(`You only have ${(listing.qtyOnHandCenti - listing.qtyReservedCenti) / 100} available of that fabric.`);
    fabricMinor = priceForQty(listing.pricePerUnitMinor, qty);
    fabricQtyCenti = qty;
    fabricListingId = listing.id;
    fabricDescription = `${listing.name}, ${qty / 100} ${listing.unit === "METRE" ? "metres" : "yards"}`;
  }
  const appointment = order.measurementMethod === "HOME_VISIT" ? await tx.appointment.findFirst({ where: { orderId: order.id, status: { not: "CANCELLED" } } }) : null;
  const built = buildQuoteLines(
    {
      labourMinor: labour, fabricMinor, fabricDescription, measurementMinor: appointment?.feeMinor ?? 0,
      otherMinor: d.otherAmount ? parseCedis(d.otherAmount) ?? 0 : 0, otherDescription: d.otherDescription,
      discountMinor: d.discount ? parseCedis(d.discount) ?? 0 : 0,
    },
    settings,
  );
  const depositBps = d.depositPercent != null ? d.depositPercent * 100 : settings.depositBps;
  const depositMinor = Math.min(built.totalMinor, Math.floor((built.totalMinor * depositBps) / 10000));
  return { ...built, depositMinor, completion, fabricQtyCenti, fabricListingId, message: d.message, validUntil: addDays(new Date(), settings.quoteValidityDays) };
}

/** A business replies to a quote request with an itemised quotation. */
export async function submitQuote(actor: Actor, quotationId: string, input: z.input<typeof quoteSchema>) {
  const q = await db.quotation.findUnique({ where: { id: quotationId }, include: { order: true, business: true } });
  if (!q) throw notFound("Quote request");
  requireMember(actor, q.businessId, "MANAGER");
  if (q.business.verificationStatus !== "VERIFIED") throw forbidden("Your business must be verified before it can quote.");
  if (q.status !== "REQUESTED") throw invalid("This request has already been answered.");
  if (!["QUOTE_REQUESTED", "QUOTED"].includes(q.order.status)) throw invalid("The customer is no longer collecting quotes.");
  const res = await db.$transaction(async (tx) => {
    const p = await prepareQuote(tx, q.order, q.businessId, input);
    const claimed = await tx.quotation.updateMany({
      where: { id: q.id, status: "REQUESTED" },
      data: {
        status: "SUBMITTED", totalMinor: p.totalMinor, depositMinor: p.depositMinor, completionDate: p.completion, fabricQtyCenti: p.fabricQtyCenti,
        fabricListingId: p.fabricListingId, message: p.message, validUntil: p.validUntil, submittedById: actor.userId, respondedAt: new Date(),
      },
    });
    if (claimed.count === 0) throw conflict("This request has just been answered.");
    await tx.quotationLine.createMany({ data: p.lines.map((l, i) => ({ quotationId: q.id, ...l, sortOrder: i })) });
    if (q.order.status === "QUOTE_REQUESTED") {
      await transition(tx, { orderId: q.orderId, from: "QUOTE_REQUESTED", to: "QUOTED", actorId: actor.userId, as: "BUSINESS", note: `${q.business.name} sent a quote` });
    } else {
      await orderEvent(tx, q.orderId, "QUOTE", actor.userId, "BUSINESS", `${q.business.name} sent a quote of ${formatMoney(p.totalMinor)}`);
    }
    return p;
  });
  await notify(q.order.customerId, "quote.submitted", { business: q.business.name, amount: formatMoney(res.totalMinor), order: q.order.number }, { link: `/orders/${q.orderId}`, orderId: q.orderId });
}

export async function declineQuoteRequest(actor: Actor, quotationId: string, reason: string) {
  const q = await db.quotation.findUnique({ where: { id: quotationId }, include: { order: true, business: true } });
  if (!q) throw notFound("Quote request");
  requireMember(actor, q.businessId, "MANAGER");
  const res = await db.quotation.updateMany({ where: { id: q.id, status: { in: ["REQUESTED", "SUBMITTED"] } }, data: { status: "DECLINED", message: reason.slice(0, 500), respondedAt: new Date() } });
  if (res.count === 0) throw invalid("This request was already closed.");
  await db.$transaction(async (tx) => {
    await orderEvent(tx, q.orderId, "QUOTE", actor.userId, "BUSINESS", `${q.business.name} declined`, { reason });
    const live = await tx.quotation.count({ where: { orderId: q.orderId, status: "SUBMITTED" } });
    if (q.order.status === "QUOTED" && live === 0) {
      await transition(tx, { orderId: q.orderId, from: "QUOTED", to: "QUOTE_REQUESTED", actorId: null, as: "SYSTEM", note: "No open quotes left" });
    }
  });
  await notify(q.order.customerId, "quote.declined", { business: q.business.name, order: q.order.number }, { link: `/orders/${q.orderId}`, orderId: q.orderId });
}

/** The customer accepts one quotation. Fabric is reserved now so it can't be sold twice. */
export async function acceptQuote(actor: Actor, quotationId: string) {
  const q = await db.quotation.findUnique({ where: { id: quotationId }, include: { order: true, business: true } });
  if (!q || q.order.customerId !== actor.userId) throw notFound("Quotation");
  if (q.status !== "SUBMITTED") throw invalid("This quotation can't be accepted.");
  if (q.validUntil && q.validUntil < new Date()) throw invalid("This quotation has expired. Ask the business for a new one.");
  if (q.business.verificationStatus !== "VERIFIED") throw invalid("This business can't take orders right now.");
  const settings = await getSettings();
  await db.$transaction(async (tx) => {
    const claimed = await tx.quotation.updateMany({ where: { id: q.id, status: "SUBMITTED" }, data: { status: "ACCEPTED" } });
    if (claimed.count === 0) throw conflict("This quotation has just changed.");
    await tx.quotation.updateMany({ where: { orderId: q.orderId, id: { not: q.id }, status: { in: ["REQUESTED", "SUBMITTED"] } }, data: { status: "REJECTED" } });
    if (q.fabricListingId && q.fabricQtyCenti) {
      await reserveStock(tx, { listingId: q.fabricListingId, qtyCenti: q.fabricQtyCenti, orderId: q.orderId, actorId: actor.userId, expiresAt: addDays(new Date(), settings.reservationHours / 24) });
    }
    await transition(tx, {
      orderId: q.orderId, from: q.order.status, to: "AWAITING_PAYMENT", actorId: actor.userId, as: "CUSTOMER",
      note: `Accepted ${q.business.name}'s quote of ${formatMoney(q.totalMinor)}`,
      set: {
        businessId: q.businessId, acceptedQuotationId: q.id, totalMinor: q.totalMinor, depositMinor: q.depositMinor,
        fabricListingId: q.fabricListingId, fabricQtyCenti: q.fabricQtyCenti ?? q.order.fabricQtyCenti,
      },
    });
  });
  await notifyBusiness(q.businessId, "quote.accepted", { order: q.order.number }, { link: `/biz/${q.businessId}/orders/${q.orderId}`, orderId: q.orderId });
}

/** After acceptance, a business may propose a change. Nothing changes unless the customer approves. */
export async function proposeRevision(actor: Actor, orderId: string, input: z.input<typeof quoteSchema> & { reason: string }) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { acceptedQuotation: true, business: true } });
  if (!order || !order.businessId || !order.acceptedQuotation) throw notFound("Order");
  requireMember(actor, order.businessId, "MANAGER");
  if (!["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED", "IN_PRODUCTION"].includes(order.status)) throw invalid("This order can't be changed at this stage.");
  if (!input.reason?.trim()) throw invalid("Explain why the quote needs to change.");
  if (await db.quotation.findFirst({ where: { orderId, revisionOfId: order.acceptedQuotation.id, status: "SUBMITTED" } })) throw conflict("A change is already waiting for the customer.");
  const p = await db.$transaction(async (tx) => {
    const prep = await prepareQuote(tx, order, order.businessId!, input);
    const prev = order.acceptedQuotation!;
    const rev = await tx.quotation.create({
      data: {
        orderId, businessId: order.businessId!, status: "SUBMITTED", version: prev.version + 1, revisionOfId: prev.id, totalMinor: prep.totalMinor,
        depositMinor: Math.max(prep.depositMinor, Math.min(prep.totalMinor, order.depositMinor)), completionDate: prep.completion,
        fabricQtyCenti: prep.fabricQtyCenti, fabricListingId: prep.fabricListingId, message: `${input.reason.trim()}\n\n${prep.message}`.trim(),
        validUntil: prep.validUntil, submittedById: actor.userId, respondedAt: new Date(),
        lines: { create: prep.lines.map((l, i) => ({ ...l, sortOrder: i })) },
      },
    });
    await orderEvent(tx, orderId, "QUOTE", actor.userId, "BUSINESS", `Change proposed: new total ${formatMoney(prep.totalMinor)}`, { revisionId: rev.id, reason: input.reason });
    return prep;
  });
  await notify(order.customerId, "quote.revision", { business: order.business!.name, order: order.number, amount: formatMoney(p.totalMinor) }, { link: `/orders/${orderId}`, orderId });
}

export async function decideRevision(actor: Actor, revisionId: string, approve: boolean) {
  const rev = await db.quotation.findUnique({ where: { id: revisionId }, include: { order: true } });
  if (!rev || rev.order.customerId !== actor.userId || !rev.revisionOfId) throw notFound("Change request");
  if (rev.status !== "SUBMITTED") throw invalid("This change has already been decided.");
  const settings = await getSettings();
  await db.$transaction(async (tx) => {
    const claimed = await tx.quotation.updateMany({ where: { id: rev.id, status: "SUBMITTED" }, data: { status: approve ? "ACCEPTED" : "REJECTED" } });
    if (claimed.count === 0) throw conflict("This change has just been decided.");
    if (!approve) {
      await orderEvent(tx, rev.orderId, "QUOTE", actor.userId, "CUSTOMER", "Customer kept the original quote");
      return;
    }
    if (rev.order.status === "IN_PRODUCTION" && (rev.fabricListingId !== rev.order.fabricListingId || rev.fabricQtyCenti !== rev.order.fabricQtyCenti)) {
      throw invalid("Fabric can't be changed after sewing has started.");
    }
    await tx.quotation.update({ where: { id: rev.revisionOfId! }, data: { status: "SUPERSEDED" } });
    // Swap the fabric reservation if the fabric changed.
    if (rev.fabricListingId !== rev.order.fabricListingId || rev.fabricQtyCenti !== rev.order.fabricQtyCenti) {
      await releaseOrderReservations(tx, rev.orderId, actor.userId, "Quote revised");
      if (rev.fabricListingId && rev.fabricQtyCenti) {
        await reserveStock(tx, { listingId: rev.fabricListingId, qtyCenti: rev.fabricQtyCenti, orderId: rev.orderId, actorId: actor.userId, expiresAt: rev.order.amountPaidMinor > 0 ? null : addDays(new Date(), settings.reservationHours / 24) });
      }
    }
    const next = { totalMinor: rev.totalMinor, depositMinor: rev.depositMinor, amountPaidMinor: rev.order.amountPaidMinor, amountRefundedMinor: rev.order.amountRefundedMinor };
    await tx.order.update({
      where: { id: rev.orderId },
      data: { acceptedQuotationId: rev.id, totalMinor: rev.totalMinor, depositMinor: rev.depositMinor, fabricListingId: rev.fabricListingId, fabricQtyCenti: rev.fabricQtyCenti ?? rev.order.fabricQtyCenti, paymentStatus: paymentStatusFor(next) },
    });
    await orderEvent(tx, rev.orderId, "QUOTE", actor.userId, "CUSTOMER", `Customer approved the change: total now ${formatMoney(rev.totalMinor)}`);
  });
  await notifyBusiness(rev.businessId, approve ? "quote.revision.approved" : "quote.revision.rejected", { order: rev.order.number }, { link: `/biz/${rev.businessId}/orders/${rev.orderId}`, orderId: rev.orderId });
}

// ───────────── Fabric orders ─────────────

export const fabricOrderSchema = z.object({
  listingId: z.string().min(1),
  quantity: z.string().min(1, "Enter a quantity"),
  fulfilment: z.enum(["PICKUP", "DELIVERY"]),
  addressText: z.string().trim().max(300).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  /** Deliver to the tailor of one of the customer's own orders. */
  forOrderId: z.string().optional(),
});

/** Buy fabric. Stock is reserved immediately; the seller confirms before the customer pays. */
export async function createFabricOrder(actor: Actor, input: z.input<typeof fabricOrderSchema>) {
  const d = fabricOrderSchema.parse(input);
  const settings = await getSettings();
  const listing = await db.fabricListing.findFirst({ where: { id: d.listingId, status: "ACTIVE" }, include: { business: true } });
  if (!listing || listing.business.verificationStatus !== "VERIFIED") throw notFound("Fabric");
  const qty = parseQty(d.quantity);
  if (!qty) throw invalid("Enter a quantity like 6 or 2.5.");
  if (qty < listing.minOrderCenti) throw invalid(`The minimum order is ${listing.minOrderCenti / 100} ${listing.unit === "METRE" ? "metres" : "yards"}.`);

  let dropoff: { lat: number; lng: number; address: string } | null = null;
  let parent: { id: string; businessId: string | null } | null = null;
  if (d.forOrderId) {
    const p = await db.order.findFirst({ where: { id: d.forOrderId, customerId: actor.userId, kind: "CUSTOM", fabricSource: "SELLER" }, include: { business: true } });
    if (!p || !p.business) throw invalid("Choose one of your custom orders that has a tailor and needs fabric from a seller.");
    if (WORK_STARTED.includes(p.status as never) || ["CANCELLED", "REFUNDED"].includes(p.status)) throw invalid("That order can no longer receive fabric.");
    dropoff = { lat: p.business.lat, lng: p.business.lng, address: `${p.business.name}, ${p.business.address}, ${p.business.city}` };
    parent = { id: p.id, businessId: p.businessId };
  } else if (d.fulfilment === "DELIVERY") {
    if (d.lat == null || d.lng == null || !d.addressText) throw invalid("Share your location and enter an address or landmark for delivery.");
    dropoff = { lat: d.lat, lng: d.lng, address: d.addressText };
  }
  const fulfilment = parent ? "DELIVERY" : d.fulfilment;
  const fabricMinor = priceForQty(listing.pricePerUnitMinor, qty);
  const deliveryMinor = dropoff ? deliveryFeeBetween(listing.business, dropoff, settings) : 0;
  const built = buildQuoteLines({ labourMinor: 0, fabricMinor, fabricDescription: `${listing.name}, ${qty / 100} ${listing.unit === "METRE" ? "metres" : "yards"}`, measurementMinor: 0, otherMinor: 0, discountMinor: 0 }, settings);
  const lines = deliveryMinor > 0 ? [...built.lines, { kind: "DELIVERY", description: parent ? "Delivery to your tailor" : "Delivery", amountMinor: deliveryMinor }] : built.lines;
  const total = built.totalMinor + deliveryMinor;

  const order = await db.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        kind: "FABRIC", status: "DRAFT", customerId: actor.userId, businessId: listing.businessId, fabricSource: "SELLER", fabricListingId: listing.id,
        fabricQtyCenti: qty, fulfilment, addressText: dropoff?.address ?? null, lat: dropoff?.lat ?? null, lng: dropoff?.lng ?? null,
        parentOrderId: parent?.id ?? null, totalMinor: total, depositMinor: total, isDemo: actor.isDemo,
      },
    });
    await reserveStock(tx, { listingId: listing.id, qtyCenti: qty, orderId: o.id, actorId: actor.userId, expiresAt: addDays(new Date(), settings.reservationHours / 24) });
    await tx.quotation.create({
      data: {
        orderId: o.id, businessId: listing.businessId, status: "SUBMITTED", totalMinor: total, depositMinor: total, fabricQtyCenti: qty, fabricListingId: listing.id,
        message: "Listed price", validUntil: addDays(new Date(), settings.reservationHours / 24), respondedAt: new Date(),
        lines: { create: lines.map((l, i) => ({ ...l, sortOrder: i })) },
      },
    });
    await transition(tx, { orderId: o.id, from: "DRAFT", to: "QUOTE_REQUESTED", actorId: actor.userId, as: "CUSTOMER", note: "Waiting for the seller to confirm stock" });
    return o;
  });
  await notifyBusiness(listing.businessId, "quote.requested", { order: order.number, item: `${qty / 100} of ${listing.name}` }, { link: `/biz/${listing.businessId}/orders/${order.id}`, orderId: order.id });
  return order;
}

/** The seller confirms they have the fabric (or rejects, which releases the reservation). */
export async function sellerRespondFabricOrder(actor: Actor, orderId: string, confirm: boolean, reason = "") {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { quotations: true } });
  if (!order || order.kind !== "FABRIC" || !order.businessId) throw notFound("Order");
  requireMember(actor, order.businessId, "STAFF");
  if (order.status !== "QUOTE_REQUESTED") throw invalid("This order has already been answered.");
  const q = order.quotations[0];
  await db.$transaction(async (tx) => {
    if (confirm) {
      await tx.quotation.update({ where: { id: q.id }, data: { status: "ACCEPTED" } });
      await transition(tx, { orderId, from: "QUOTE_REQUESTED", to: "AWAITING_PAYMENT", actorId: actor.userId, as: "BUSINESS", note: "Seller confirmed the fabric is available", set: { acceptedQuotationId: q.id } });
    } else {
      await tx.quotation.update({ where: { id: q.id }, data: { status: "DECLINED", message: reason.slice(0, 300) } });
      await releaseOrderReservations(tx, orderId, actor.userId, "Seller declined");
      await transition(tx, { orderId, from: "QUOTE_REQUESTED", to: "CANCELLED", actorId: actor.userId, as: "SYSTEM", note: "Seller couldn't supply the fabric", set: { cancelReason: reason || "The seller couldn't supply this fabric." } });
    }
  });
  if (confirm) {
    await notify(order.customerId, "order.status", { order: order.number, status: `the seller confirmed your fabric. Please pay ${formatMoney(order.totalMinor)}` }, { link: `/orders/${orderId}`, orderId });
  } else {
    await notify(order.customerId, "order.cancelled", { order: order.number, reason: reason || "The seller couldn't supply this fabric." }, { link: `/orders/${orderId}`, orderId });
  }
}

// ───────────── Cancellation ─────────────

/**
 * Cancellation policy (docs/policies): free before payment; after payment and before sewing starts, a full
 * refund minus any completed measurement visit; after sewing starts, raise a dispute instead.
 */
export async function cancelOrder(actor: Actor, orderId: string, reason: string) {
  const { order, rel } = await requireOrderAccess(db, actor, orderId, ["CUSTOMER", "BUSINESS", "ADMIN"]);
  if (WORK_STARTED.includes(order.status as never)) throw invalid("Work has started on this order, so it can't be cancelled. Raise a dispute if something is wrong.");
  if (["CANCELLED", "REFUNDED", "DISPUTED"].includes(order.status)) throw invalid("This order can't be cancelled now.");
  const as = rel.includes("CUSTOMER") ? "CUSTOMER" : rel.includes("ADMIN") ? "ADMIN" : "BUSINESS";
  if (as === "BUSINESS") {
    if (!memberAtLeastManager(actor, order.businessId)) throw forbidden();
    if (!["AWAITING_PAYMENT", "AWAITING_MEASUREMENTS", "MEASUREMENTS_CONFIRMED"].includes(order.status)) throw invalid("Decline the quote request instead.");
  }
  const { refundForCancellation } = await import("./payments");
  await db.$transaction(async (tx) => {
    await releaseOrderReservations(tx, orderId, actor.userId, "Order cancelled");
    await tx.quotation.updateMany({ where: { orderId, status: { in: ["REQUESTED", "SUBMITTED"] } }, data: { status: "WITHDRAWN" } });
    await tx.appointment.updateMany({ where: { orderId, status: { in: ["REQUESTED", "ACCEPTED"] } }, data: { status: "CANCELLED" } });
    await tx.deliveryAssignment.updateMany({ where: { orderId, status: { in: ["PENDING_PAYMENT", "OPEN"] } }, data: { status: "CANCELLED" } });
    await transition(tx, { orderId, from: order.status, to: "CANCELLED", actorId: actor.userId, as, note: reason, set: { cancelReason: reason.slice(0, 300) || "Cancelled" } });
  });
  if (order.amountPaidMinor > 0) await refundForCancellation(actor, orderId, reason);
  const others = [order.customerId].filter((id) => id !== actor.userId);
  await notifyMany(others, "order.cancelled", { order: order.number, reason }, { link: `/orders/${orderId}`, orderId });
  if (order.businessId && as !== "BUSINESS") await notifyBusiness(order.businessId, "order.cancelled", { order: order.number, reason }, { orderId });
}

function memberAtLeastManager(actor: Actor, businessId: string | null) {
  const r = membershipRole(actor, businessId);
  return r === "OWNER" || r === "MANAGER";
}

// ───────────── Production (business) ─────────────

export async function businessAdvance(actor: Actor, orderId: string, to: "MEASUREMENTS_CONFIRMED" | "AWAITING_MEASUREMENTS" | "IN_PRODUCTION" | "QUALITY_CHECK" | "READY", note = "") {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { style: true } });
  if (!order || !order.businessId) throw notFound("Order");
  try {
    requireMember(actor, order.businessId, "STAFF");
  } catch {
    throw notFound("Order");
  }
  const b = await db.business.findUniqueOrThrow({ where: { id: order.businessId } });
  if (b.verificationStatus !== "VERIFIED") throw forbidden("Your business must be verified to fulfil orders.");
  if (to === "MEASUREMENTS_CONFIRMED" && !order.measurementRecordId) throw invalid("Attach or record measurements first.");
  if (to === "IN_PRODUCTION" && order.amountPaidMinor < order.depositMinor) throw invalid("Wait for the deposit before starting.");
  await db.$transaction(async (tx) => {
    if (to === "IN_PRODUCTION") await consumeOrderReservations(tx, orderId, actor.userId);
    await transition(tx, { orderId, from: order.status, to, actorId: actor.userId, as: "BUSINESS", note });
  });
  if (to === "READY") {
    await notify(order.customerId, "order.ready.choose", { order: order.number }, { link: `/orders/${orderId}`, orderId });
  } else {
    const { ORDER_STATUS } = await import("@/lib/enums");
    await notify(order.customerId, "order.status", { order: order.number, status: ORDER_STATUS[to].label }, { link: `/orders/${orderId}`, orderId });
  }
}

/** Workshop measurements taken by the business itself. */
export async function recordWorkshopMeasurements(actor: Actor, orderId: string, values: MeasurementValues, notes = "") {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { style: true } });
  if (!order || !order.businessId) throw notFound("Order");
  requireMember(actor, order.businessId, "STAFF");
  if (order.status !== "AWAITING_MEASUREMENTS") throw invalid("This order isn't waiting for measurements.");
  checkRequired(values, order.style?.measurementKeys ?? []);
  await db.$transaction(async (tx) => {
    const profile = await ensureProfile(tx, order.customerId, null);
    const rec = await addRecord(tx, { profileId: profile.id, values, source: "WORKSHOP", status: "SUBMITTED", createdById: actor.userId, notes });
    await transition(tx, { orderId, from: "AWAITING_MEASUREMENTS", to: "MEASUREMENTS_CONFIRMED", actorId: actor.userId, as: "BUSINESS", note: "Measured at the workshop", set: { measurementRecordId: rec.id } });
  });
  await notify(order.customerId, "measurements.submitted", { order: order.number }, { link: `/measurements`, orderId });
}

// ───────────── Handover: pickup or delivery ─────────────

/** When the order is ready, the customer chooses pickup or delivery. Delivery adds a fee to pay before dispatch. */
export async function chooseFulfilment(actor: Actor, orderId: string, input: { fulfilment: "PICKUP" | "DELIVERY"; addressText?: string; lat?: number; lng?: number }) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { business: true, deliveries: true } });
  if (!order || order.customerId !== actor.userId || !order.business) throw notFound("Order");
  if (order.kind !== "CUSTOM") throw invalid("Fabric orders choose delivery when ordering.");
  if (order.status !== "READY") throw invalid("You can choose delivery or pickup when the order is ready.");
  const settings = await getSettings();
  await db.$transaction(async (tx) => {
    // Remove any earlier unpaid delivery choice (and its fee).
    const pending = order.deliveries.filter((d) => d.status === "PENDING_PAYMENT");
    let total = order.totalMinor - pending.reduce((t, d) => t + d.feeMinor, 0);
    await tx.deliveryAssignment.updateMany({ where: { id: { in: pending.map((d) => d.id) } }, data: { status: "CANCELLED" } });
    if (input.fulfilment === "DELIVERY") {
      if (input.lat == null || input.lng == null || !input.addressText?.trim()) throw invalid("Share your location and enter an address or landmark.");
      const fee = deliveryFeeBetween(order.business!, { lat: input.lat, lng: input.lng }, settings);
      const customer = await tx.user.findUniqueOrThrow({ where: { id: actor.userId } });
      await tx.deliveryAssignment.create({
        data: {
          orderId, leg: "GARMENT_TO_CUSTOMER", status: "PENDING_PAYMENT", pickupName: order.business!.name, pickupAddress: `${order.business!.address}, ${order.business!.city}`,
          pickupLat: order.business!.lat, pickupLng: order.business!.lng, dropoffName: customer.name, dropoffAddress: input.addressText.trim(),
          dropoffLat: input.lat, dropoffLng: input.lng, feeMinor: fee, proofCodeHash: "",
        },
      });
      total += fee;
    }
    const money = { totalMinor: total, depositMinor: order.depositMinor, amountPaidMinor: order.amountPaidMinor, amountRefundedMinor: order.amountRefundedMinor };
    await tx.order.update({
      where: { id: orderId },
      data: { fulfilment: input.fulfilment, totalMinor: total, paymentStatus: paymentStatusFor(money), ...(input.fulfilment === "DELIVERY" ? { addressText: input.addressText, lat: input.lat, lng: input.lng } : {}) },
    });
    await orderEvent(tx, orderId, "FULFILMENT", actor.userId, "CUSTOMER", input.fulfilment === "PICKUP" ? "Customer will collect" : "Customer chose delivery");
  });
  const { dispatchIfReady } = await import("./deliveries");
  await dispatchIfReady(orderId);
}

/** Issue (or re-issue) the code the customer shows at pickup. Only the hash is stored. */
export async function issuePickupCode(actor: Actor, orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { business: true } });
  if (!order || order.customerId !== actor.userId) throw notFound("Order");
  if (order.status !== "READY" || order.fulfilment !== "PICKUP") throw invalid("Your pickup code is available when the order is ready for collection.");
  const code = newHandoverCode();
  await db.order.update({ where: { id: orderId }, data: { handoverCodeHash: hashCode(orderId, code) } });
  return code;
}

/** The business hands the order over at the workshop after checking the customer's code. */
export async function markCollected(actor: Actor, orderId: string, code: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || !order.businessId) throw notFound("Order");
  requireMember(actor, order.businessId, "STAFF");
  if (order.status !== "READY" || order.fulfilment !== "PICKUP") throw invalid("This order isn't waiting for collection.");
  if (order.amountPaidMinor < order.totalMinor) throw invalid("The balance must be paid before handover.");
  await rateLimit(`handover:${orderId}`, 5, 3600);
  if (!order.handoverCodeHash || order.handoverCodeHash !== hashCode(orderId, code.trim())) throw invalid("That code doesn't match. Ask the customer to open their order and read the pickup code.");
  await db.$transaction(async (tx) => {
    if (order.kind === "FABRIC") await consumeOrderReservations(tx, orderId, actor.userId);
    await transition(tx, { orderId, from: "READY", to: "COLLECTED", actorId: actor.userId, as: "BUSINESS", note: "Collected by the customer", set: { handoverCodeHash: null } });
  });
  await notify(order.customerId, "order.status", { order: order.number, status: "Collected. Please confirm everything is fine" }, { link: `/orders/${orderId}`, orderId });
}

/** The customer confirms they're happy; money is then settled to the business and partners. */
export async function confirmCompletion(actor: Actor, orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order || order.customerId !== actor.userId) throw notFound("Order");
  await completeOrder(orderId, order.status, actor.userId, "CUSTOMER");
}

export async function completeOrder(orderId: string, from: string, actorId: string | null, as: "CUSTOMER" | "SYSTEM" | "ADMIN") {
  const { settleCompletedOrder } = await import("./payments");
  const order = await db.$transaction(async (tx) => {
    await transition(tx, { orderId, from, to: "COMPLETED", actorId, as, note: as === "SYSTEM" ? "Completed automatically after handover" : "" });
    await settleCompletedOrder(tx, orderId);
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { style: true } });
    if (o.businessId) await tx.business.update({ where: { id: o.businessId }, data: { completedOrders: { increment: 1 } } });
    return o;
  });
  await notify(order.customerId, "order.completed", { order: order.number }, { link: `/orders/${orderId}`, orderId });
  return order;
}

