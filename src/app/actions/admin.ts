"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveImage } from "@/lib/uploads";
import { sendSms } from "@/lib/sms";

type Decision = "VERIFIED" | "REJECTED";

async function tellVerification(user: { id: string; phone: string }, decision: Decision, link: string) {
  const message = decision === "VERIFIED"
    ? "Your account has been verified. You can now start working on Ntoma."
    : "We couldn't verify your account. Please contact Ntoma support.";
  await db.notification.create({ data: { userId: user.id, message, link } });
  await sendSms(user.phone, `Ntoma: ${message}`);
}

export async function verifyBusiness(businessId: string, decision: Decision) {
  await requireUser("ADMIN");
  const b = await db.business.update({ where: { id: businessId }, data: { verificationStatus: decision }, include: { owner: true } });
  await tellVerification(b.owner, decision, "/business");
  revalidatePath("/admin");
}

export async function verifyAgent(userId: string, decision: Decision) {
  await requireUser("ADMIN");
  const res = await db.user.updateMany({ where: { id: userId, role: { in: ["MEASURER", "RIDER"] } }, data: { verificationStatus: decision } });
  if (res.count) {
    const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
    await tellVerification(u, decision, u.role === "MEASURER" ? "/measurer" : "/rider");
  }
  revalidatePath("/admin");
}

export async function markPayoutPaid(payoutId: string, formData: FormData) {
  await requireUser("ADMIN");
  const reference = z.string().trim().min(3).max(100).parse(formData.get("reference"));
  const p = await db.payout.update({
    where: { id: payoutId, status: "PENDING" },
    data: { status: "PAID", reference, paidAt: new Date() },
    include: { user: true },
  });
  const message = `We've sent you GH₵ ${p.amount.toFixed(2)} by Mobile Money (ref ${reference}).`;
  await db.notification.create({ data: { userId: p.userId, orderId: p.orderId, message, link: "/earnings" } });
  await sendSms(p.user.phone, `Ntoma: ${message}`);
  revalidatePath("/admin/payouts");
}

const styleSchema = z.object({
  name: z.string().trim().min(2),
  category: z.string().trim().min(2).max(40),
  wearer: z.enum(["WOMEN", "MEN", "UNISEX"]),
  description: z.string().trim().min(3).max(300),
  yardsNeeded: z.coerce.number().positive().max(30),
  icon: z.string().trim().min(1).max(8),
});

export async function addStyle(_prev: { error?: string; ok?: string } | undefined, formData: FormData) {
  await requireUser("ADMIN");
  const parsed = styleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    const imageUrl = await saveImage(formData.get("photo"));
    await db.style.create({ data: { ...parsed.data, category: parsed.data.category.toUpperCase().replace(/\s+/g, "_"), imageUrl } });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/styles");
  return { ok: `Added ${parsed.data.name}.` };
}

export async function setStylePhoto(styleId: string, formData: FormData) {
  await requireUser("ADMIN");
  const imageUrl = await saveImage(formData.get("photo"));
  if (imageUrl) await db.style.update({ where: { id: styleId }, data: { imageUrl } });
  revalidatePath("/admin/styles");
}
