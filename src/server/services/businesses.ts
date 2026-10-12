import { z } from "zod";
import { db } from "@/lib/db";
import { BUSINESS_KINDS, CITIES } from "@/lib/enums";
import { parseCedis } from "@/lib/money";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { requireMember } from "../authz";
import { conflict, invalid, notFound } from "../errors";
import { phoneSchema } from "./accounts";

const kindsSchema = z.array(z.enum(Object.keys(BUSINESS_KINDS) as [string, ...string[]])).min(1, "Choose at least one type of business");

export const businessSchema = z.object({
  name: z.string().trim().min(2, "Enter the business name").max(100),
  kinds: kindsSchema,
  description: z.string().trim().max(1000).default(""),
  phone: phoneSchema,
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  address: z.string().trim().min(3, "Enter the workshop address or a landmark").max(300),
  city: z.string().refine((c) => c in CITIES, "Choose a city"),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  registrationNumber: z.string().trim().min(5, "Enter your business registration or Ghana Card number").max(40),
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "business";
}

/** Create a business owned by the actor. It stays hidden from customers until verified. */
export async function createBusiness(actor: Actor, input: z.input<typeof businessSchema>, documentIds: string[] = []) {
  const data = businessSchema.parse(input);
  const owned = actor.memberships.filter((m) => m.role === "OWNER").length;
  if (owned >= 3) throw invalid("You can own up to three businesses.");
  const loc = data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : CITIES[data.city];
  let slug = slugify(data.name);
  if (await db.business.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  return db.$transaction(async (tx) => {
    const b = await tx.business.create({
      data: {
        name: data.name, slug, kinds: data.kinds, description: data.description, phone: data.phone, email: data.email || null,
        address: data.address, city: data.city, lat: loc.lat, lng: loc.lng, registrationNumber: data.registrationNumber, payoutPhone: data.phone,
        members: { create: { userId: actor.userId, role: "OWNER" } },
      },
    });
    await tx.verificationApplication.create({
      data: { subjectType: "BUSINESS", applicantId: actor.userId, businessId: b.id, details: { registrationNumber: data.registrationNumber }, documentIds },
    });
    return b;
  });
}

const profileSchema = businessSchema.omit({ registrationNumber: true }).extend({
  serviceRadiusKm: z.coerce.number().int().min(1).max(200),
  capacityPerWeek: z.coerce.number().int().min(1, "Capacity must be at least one garment a week").max(1000),
  offersWorkshopFitting: z.boolean(),
  skills: z.array(z.string()).max(20),
  operatingHours: z.record(z.string(), z.string().max(20)),
  payoutPhone: phoneSchema.optional().or(z.literal("")),
});

export async function updateBusinessProfile(actor: Actor, businessId: string, input: z.input<typeof profileSchema>) {
  requireMember(actor, businessId, "MANAGER");
  const data = profileSchema.parse(input);
  const categories = await db.garmentCategory.findMany({ select: { slug: true } });
  const valid = new Set(categories.map((c) => c.slug));
  const loc = data.lat != null && data.lng != null ? { lat: data.lat, lng: data.lng } : undefined;
  await db.business.update({
    where: { id: businessId },
    data: {
      name: data.name, kinds: data.kinds, description: data.description, phone: data.phone, email: data.email || null,
      address: data.address, city: data.city, ...(loc ?? {}), serviceRadiusKm: data.serviceRadiusKm, capacityPerWeek: data.capacityPerWeek,
      offersWorkshopFitting: data.offersWorkshopFitting, skills: data.skills.filter((s) => valid.has(s)), operatingHours: data.operatingHours,
      payoutPhone: data.payoutPhone || data.phone,
    },
  });
  await audit(actor.userId, "business.update_profile", { type: "Business", id: businessId });
}

// ── Team ──

export async function addMember(actor: Actor, businessId: string, email: string, role: "MANAGER" | "STAFF") {
  requireMember(actor, businessId, "OWNER");
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.status !== "ACTIVE") throw notFound("An account with that email");
  if (!["MANAGER", "STAFF"].includes(role)) throw invalid("Choose Manager or Staff.");
  const existing = await db.membership.findUnique({ where: { businessId_userId: { businessId, userId: user.id } } });
  if (existing) throw conflict("That person is already a member.");
  await db.membership.create({ data: { businessId, userId: user.id, role } });
  await audit(actor.userId, "business.member_add", { type: "Business", id: businessId }, { userId: user.id, role });
}

export async function changeMemberRole(actor: Actor, businessId: string, membershipId: string, role: "MANAGER" | "STAFF") {
  requireMember(actor, businessId, "OWNER");
  const m = await db.membership.findFirst({ where: { id: membershipId, businessId } });
  if (!m) throw notFound("Member");
  if (m.role === "OWNER") throw invalid("The owner's role can't be changed here.");
  await db.membership.update({ where: { id: m.id }, data: { role } });
  await audit(actor.userId, "business.member_role", { type: "Business", id: businessId }, { userId: m.userId, role });
}

export async function removeMember(actor: Actor, businessId: string, membershipId: string) {
  requireMember(actor, businessId, "OWNER");
  const m = await db.membership.findFirst({ where: { id: membershipId, businessId } });
  if (!m) throw notFound("Member");
  if (m.role === "OWNER") throw invalid("The owner can't be removed.");
  await db.membership.delete({ where: { id: m.id } });
  await db.user.update({ where: { id: m.userId }, data: { sessionVersion: { increment: 1 } } });
  await audit(actor.userId, "business.member_remove", { type: "Business", id: businessId }, { userId: m.userId });
}

// ── Styles offered ──

export async function setStyleOffer(actor: Actor, businessId: string, styleId: string, input: { price: string; daysToMake: number }) {
  requireMember(actor, businessId, "MANAGER");
  const style = await db.style.findFirst({ where: { id: styleId, status: "PUBLISHED" } });
  if (!style) throw notFound("Style");
  const priceMinor = input.price.trim() === "" ? null : parseCedis(input.price);
  if (input.price.trim() !== "" && (priceMinor == null || priceMinor <= 0)) throw invalid("Enter a price in cedis, or leave it empty for 'price on request'.");
  const days = z.number().int().min(1).max(120).parse(input.daysToMake);
  await db.businessStyle.upsert({
    where: { businessId_styleId: { businessId, styleId } },
    create: { businessId, styleId, priceMinor, daysToMake: days },
    update: { priceMinor, daysToMake: days },
  });
  const category = await db.garmentCategory.findUnique({ where: { id: style.categoryId } });
  if (category) {
    const b = await db.business.findUniqueOrThrow({ where: { id: businessId } });
    if (!b.skills.includes(category.slug)) await db.business.update({ where: { id: businessId }, data: { skills: { push: category.slug } } });
  }
}

export async function removeStyleOffer(actor: Actor, businessId: string, styleId: string) {
  requireMember(actor, businessId, "MANAGER");
  await db.businessStyle.deleteMany({ where: { businessId, styleId } });
}

// ── Portfolio ──

export async function addPortfolioPhoto(actor: Actor, businessId: string, url: string, caption: string) {
  requireMember(actor, businessId, "STAFF");
  const count = await db.businessPhoto.count({ where: { businessId } });
  if (count >= 60) throw invalid("You can show up to 60 portfolio photos.");
  await db.businessPhoto.create({ data: { businessId, url, caption: caption.trim().slice(0, 200) } });
}

export async function removePortfolioPhoto(actor: Actor, businessId: string, photoId: string) {
  requireMember(actor, businessId, "MANAGER");
  await db.businessPhoto.deleteMany({ where: { id: photoId, businessId } });
}

/** Resubmit verification after "more information needed" or a rejection. */
export async function resubmitVerification(actor: Actor, businessId: string, note: string, documentIds: string[]) {
  requireMember(actor, businessId, "OWNER");
  const b = await db.business.findUniqueOrThrow({ where: { id: businessId } });
  if (b.verificationStatus === "VERIFIED") throw invalid("This business is already verified.");
  // A suspension is lifted by an administrator, not by sending documents (which would reset the status to PENDING).
  if (b.verificationStatus === "SUSPENDED") throw invalid("This business is suspended. Contact support.");
  await db.verificationApplication.create({
    data: { subjectType: "BUSINESS", applicantId: actor.userId, businessId, details: { registrationNumber: b.registrationNumber, note: note.slice(0, 1000) }, documentIds },
  });
  await db.business.update({ where: { id: businessId }, data: { verificationStatus: "PENDING" } });
}
