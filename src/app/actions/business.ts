"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { CITIES, FABRIC_DESIGNS } from "@/lib/constants";
import { saveImage } from "@/lib/uploads";

export type ActionState = { error?: string; ok?: string } | undefined;

async function myBusiness() {
  const user = await requireUser("BUSINESS");
  if (!user.business) throw new Error("No business profile found for this account.");
  return user.business;
}

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your business name"),
  description: z.string().trim().max(500),
  phone: z.string().trim().regex(/^\+?[0-9 ]{9,15}$/, "Enter a valid phone number"),
  address: z.string().trim().min(3, "Enter your shop address"),
  city: z.string().refine((c) => c in CITIES, "Choose a city"),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const b = await myBusiness();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.business.update({ where: { id: b.id }, data: parsed.data });
  revalidatePath("/business", "layout");
  return { ok: "Profile saved." };
}

const materialSchema = z.object({
  name: z.string().trim().min(2, "Enter a fabric name"),
  design: z.enum(Object.keys(FABRIC_DESIGNS) as [string, ...string[]]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  pricePerYard: z.coerce.number().positive("Enter a price per yard"),
  yardsInStock: z.coerce.number().min(0, "Stock can't be negative"),
});

export async function addMaterial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const b = await myBusiness();
  const parsed = materialSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  let imageUrl: string | null;
  try {
    imageUrl = await saveImage(formData.get("photo"));
  } catch (e) {
    return { error: (e as Error).message };
  }
  await db.material.create({ data: { ...parsed.data, imageUrl, businessId: b.id } });
  revalidatePath("/business/stock");
  return { ok: `Added ${parsed.data.name}.` };
}

export async function setMaterialPhoto(materialId: string, formData: FormData) {
  const b = await myBusiness();
  const imageUrl = await saveImage(formData.get("photo"));
  if (imageUrl) await db.material.updateMany({ where: { id: materialId, businessId: b.id }, data: { imageUrl } });
  revalidatePath("/business/stock");
}

export async function addPortfolioPhoto(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const b = await myBusiness();
  try {
    const url = await saveImage(formData.get("photo"));
    if (!url) return { error: "Choose a photo first." };
    const caption = String(formData.get("caption") ?? "").trim().slice(0, 200);
    await db.businessPhoto.create({ data: { businessId: b.id, url, caption } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/business/photos");
  return { ok: "Photo added." };
}

export async function removePortfolioPhoto(photoId: string) {
  const b = await myBusiness();
  await db.businessPhoto.deleteMany({ where: { id: photoId, businessId: b.id } });
  revalidatePath("/business/photos");
}

export async function updateStock(materialId: string, formData: FormData) {
  const b = await myBusiness();
  const data = z.object({
    pricePerYard: z.coerce.number().positive(),
    yardsInStock: z.coerce.number().min(0),
  }).parse(Object.fromEntries(formData));
  await db.material.updateMany({ where: { id: materialId, businessId: b.id }, data });
  revalidatePath("/business/stock");
}

export async function removeMaterial(materialId: string) {
  const b = await myBusiness();
  const used = await db.order.count({ where: { materialId } });
  if (used > 0) {
    // Keep the record for past orders; just take it off sale.
    await db.material.updateMany({ where: { id: materialId, businessId: b.id }, data: { yardsInStock: 0 } });
  } else {
    await db.material.deleteMany({ where: { id: materialId, businessId: b.id } });
  }
  revalidatePath("/business/stock");
}

export async function setStyleOffer(styleId: string, formData: FormData) {
  const b = await myBusiness();
  const { price, daysToMake } = z.object({
    price: z.coerce.number().positive(),
    daysToMake: z.coerce.number().int().min(1).max(90),
  }).parse(Object.fromEntries(formData));
  await db.businessStyle.upsert({
    where: { businessId_styleId: { businessId: b.id, styleId } },
    create: { businessId: b.id, styleId, price, daysToMake },
    update: { price, daysToMake },
  });
  revalidatePath("/business/styles");
}

export async function removeStyleOffer(styleId: string) {
  const b = await myBusiness();
  await db.businessStyle.deleteMany({ where: { businessId: b.id, styleId } });
  revalidatePath("/business/styles");
}
