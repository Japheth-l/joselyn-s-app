import { z } from "zod";
import { db } from "@/lib/db";
import { COMPLEXITY, FABRIC_TYPES, MEASUREMENT_FIELDS, OCCASIONS, WEARERS } from "@/lib/enums";
import { parseCedis } from "@/lib/money";
import { parseQty } from "@/lib/qty";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { isAdmin, requireAdmin, requireMember } from "../authz";
import { adjustStock } from "../inventory";
import { conflict, forbidden, invalid, notFound } from "../errors";

// ── Styles ──

const styleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  categoryId: z.string().min(1, "Choose a category"),
  wearer: z.enum(Object.keys(WEARERS) as [string, ...string[]]),
  occasions: z.array(z.enum(Object.keys(OCCASIONS) as [string, ...string[]])).default([]),
  description: z.string().trim().min(10, "Describe the style in a sentence or two").max(600),
  complexity: z.enum(Object.keys(COMPLEXITY) as [string, ...string[]]),
  indicativeLabour: z.string().optional(),
  fabricYards: z.string().min(1, "Enter how much fabric it usually needs"),
  measurementKeys: z.array(z.enum(Object.keys(MEASUREMENT_FIELDS) as [string, ...string[]])).min(1, "Choose which measurements are needed"),
  icon: z.string().trim().min(1).max(8).default("👗"),
  imageUrl: z.string().nullable().optional(),
});

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/**
 * Admins publish styles directly. Businesses submit their own designs, which go live after review.
 */
export async function createStyle(actor: Actor, input: z.input<typeof styleSchema>, submittedByBusinessId?: string) {
  const data = styleSchema.parse(input);
  if (submittedByBusinessId) requireMember(actor, submittedByBusinessId, "MANAGER");
  else requireAdmin(actor, "CATALOGUE");
  const fabricQtyCenti = parseQty(data.fabricYards);
  if (!fabricQtyCenti) throw invalid("Enter the fabric needed in yards, e.g. 5 or 2.5.");
  const labour = data.indicativeLabour ? parseCedis(data.indicativeLabour) : null;
  if (data.indicativeLabour && labour == null) throw invalid("Enter the indicative price in cedis.");
  if (!(await db.garmentCategory.findUnique({ where: { id: data.categoryId } }))) throw notFound("Category");
  let slug = slugify(data.name);
  if (await db.style.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  const style = await db.style.create({
    data: {
      slug, name: data.name, categoryId: data.categoryId, wearer: data.wearer, occasions: data.occasions, description: data.description,
      complexity: data.complexity, indicativeLabourMinor: labour, fabricQtyCenti, measurementKeys: data.measurementKeys,
      icon: data.icon, imageUrl: data.imageUrl ?? null,
      status: submittedByBusinessId ? "PENDING" : "PUBLISHED", submittedByBusinessId: submittedByBusinessId ?? null,
    },
  });
  await audit(actor.userId, submittedByBusinessId ? "style.submit" : "style.create", { type: "Style", id: style.id });
  return style;
}

export async function setStyleImage(actor: Actor, styleId: string, imageUrl: string) {
  const s = await db.style.findUnique({ where: { id: styleId } });
  if (!s) throw notFound("Style");
  if (!isAdmin(actor, "CATALOGUE")) {
    if (!s.submittedByBusinessId) throw forbidden();
    requireMember(actor, s.submittedByBusinessId, "MANAGER");
  }
  await db.style.update({ where: { id: styleId }, data: { imageUrl } });
}

export async function reviewStyle(actor: Actor, styleId: string, decision: "PUBLISHED" | "REJECTED" | "ARCHIVED", note = "") {
  requireAdmin(actor, "CATALOGUE");
  await db.style.update({ where: { id: styleId }, data: { status: decision } });
  await audit(actor.userId, "style.review", { type: "Style", id: styleId }, { decision, note });
}

const optionSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-zA-Z0-9]*$/, "Use a short key like sleeve or neckline"),
  label: z.string().trim().min(2).max(40),
  choices: z.array(z.string().trim().min(1).max(40)).min(2, "Give at least two choices").max(15),
});

export async function upsertStyleOption(actor: Actor, styleId: string, input: z.input<typeof optionSchema>) {
  requireAdmin(actor, "CATALOGUE");
  const o = optionSchema.parse(input);
  await db.styleOption.upsert({
    where: { styleId_key: { styleId, key: o.key } },
    create: { styleId, ...o },
    update: { label: o.label, choices: o.choices },
  });
}

export async function removeStyleOption(actor: Actor, optionId: string) {
  requireAdmin(actor, "CATALOGUE");
  await db.styleOption.delete({ where: { id: optionId } });
}

export async function upsertCategory(actor: Actor, input: { slug: string; name: string; description: string; sortOrder: number; isActive: boolean }) {
  requireAdmin(actor, "CATALOGUE");
  const slug = z.string().regex(/^[a-z0-9-]{2,50}$/, "Use lowercase letters, numbers and dashes").parse(input.slug);
  await db.garmentCategory.upsert({
    where: { slug },
    create: { slug, name: input.name.trim(), description: input.description.trim(), sortOrder: input.sortOrder, isActive: input.isActive },
    update: { name: input.name.trim(), description: input.description.trim(), sortOrder: input.sortOrder, isActive: input.isActive },
  });
  await audit(actor.userId, "category.upsert", { type: "GarmentCategory", id: slug });
}

/** Validates a customer's design choices against the style's configured options. */
export function validateDesignChoices(options: { key: string; choices: string[] }[], choices: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(choices)) {
    if (!v) continue;
    if (k === "colour") { out[k] = String(v).slice(0, 40); continue; }
    const opt = options.find((o) => o.key === k);
    if (!opt) throw invalid(`"${k}" isn't an option for this style.`);
    if (!opt.choices.includes(v)) throw invalid(`"${v}" isn't available for ${k}.`);
    out[k] = v;
  }
  return out;
}

// ── Fabric listings ──

const listingSchema = z.object({
  name: z.string().trim().min(2, "Name the fabric").max(100),
  fabricType: z.enum(Object.keys(FABRIC_TYPES) as [string, ...string[]]),
  pattern: z.string().trim().max(80).default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Choose a colour"),
  colorName: z.string().trim().max(40).default(""),
  unit: z.enum(["YARD", "METRE"]),
  price: z.string().min(1, "Enter the price per unit"),
  quantity: z.string().min(1, "Enter how much you have"),
  minOrder: z.string().default("0.5"),
  widthInches: z.coerce.number().int().min(10).max(120).optional(),
  careNotes: z.string().trim().max(500).default(""),
});

export async function createListing(actor: Actor, businessId: string, input: z.input<typeof listingSchema>, photos: string[]) {
  requireMember(actor, businessId, "MANAGER");
  const d = listingSchema.parse(input);
  const price = parseCedis(d.price);
  const qty = parseQty(d.quantity);
  const min = parseQty(d.minOrder) ?? 50;
  if (!price || price <= 0) throw invalid("Enter a price in cedis, e.g. 45 or 45.50.");
  if (qty == null) throw invalid("Enter the quantity, e.g. 30 or 12.5.");
  return db.$transaction(async (tx) => {
    const l = await tx.fabricListing.create({
      data: {
        businessId, name: d.name, fabricType: d.fabricType, pattern: d.pattern, color: d.color, colorName: d.colorName, unit: d.unit,
        pricePerUnitMinor: price, qtyOnHandCenti: 0, minOrderCenti: min, widthInches: d.widthInches, careNotes: d.careNotes, photos,
      },
    });
    if (qty > 0) await adjustStock(tx, { listingId: l.id, deltaCenti: qty, type: "RESTOCK", actorId: actor.userId, note: "Opening stock" });
    return l;
  });
}

async function ownListing(actor: Actor, listingId: string, min: "STAFF" | "MANAGER" = "MANAGER") {
  const l = await db.fabricListing.findUnique({ where: { id: listingId } });
  // Same error for "doesn't exist" and "not yours", so other businesses' listings can't be probed.
  if (!l) throw notFound("Fabric listing");
  try {
    requireMember(actor, l.businessId, min);
  } catch {
    throw notFound("Fabric listing");
  }
  return l;
}

export async function updateListing(actor: Actor, listingId: string, input: { price: string; status: "ACTIVE" | "INACTIVE"; name?: string; careNotes?: string }) {
  await ownListing(actor, listingId);
  const price = parseCedis(input.price);
  if (!price || price <= 0) throw invalid("Enter a price in cedis.");
  await db.fabricListing.update({
    where: { id: listingId },
    data: { pricePerUnitMinor: price, status: input.status, ...(input.name ? { name: input.name.trim().slice(0, 100) } : {}), ...(input.careNotes != null ? { careNotes: input.careNotes.slice(0, 500) } : {}) },
  });
}

export async function changeStock(actor: Actor, listingId: string, input: { change: string; type: "RESTOCK" | "ADJUST"; note: string }) {
  await ownListing(actor, listingId, "STAFF");
  const raw = input.change.trim();
  const negative = raw.startsWith("-");
  const qty = parseQty(negative ? raw.slice(1) : raw);
  if (!qty) throw invalid("Enter a quantity like 10 or -2.5.");
  if (input.type === "ADJUST" && !input.note.trim()) throw invalid("Say why you're correcting the stock.");
  await db.$transaction((tx) => adjustStock(tx, { listingId, deltaCenti: negative ? -qty : qty, type: input.type, actorId: actor.userId, note: input.note.trim().slice(0, 200) }));
}

export async function addListingPhoto(actor: Actor, listingId: string, url: string) {
  const l = await ownListing(actor, listingId);
  if (l.photos.length >= 8) throw invalid("A listing can have up to 8 photos.");
  await db.fabricListing.update({ where: { id: listingId }, data: { photos: { push: url } } });
}

export async function removeListing(actor: Actor, listingId: string) {
  const l = await ownListing(actor, listingId);
  if (l.qtyReservedCenti > 0) throw conflict("Some of this fabric is reserved for orders. Mark it inactive instead.");
  await db.fabricListing.update({ where: { id: listingId }, data: { status: "INACTIVE" } });
}

/** Read a listing's stock history: only for members of the owning business. */
export async function listingMovements(actor: Actor, listingId: string) {
  await ownListing(actor, listingId, "STAFF");
  return db.inventoryMovement.findMany({ where: { listingId }, orderBy: { createdAt: "desc" }, take: 100 });
}
