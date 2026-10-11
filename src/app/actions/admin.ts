"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Decision = "VERIFIED" | "REJECTED";

export async function verifyBusiness(businessId: string, decision: Decision) {
  await requireUser("ADMIN");
  await db.business.update({ where: { id: businessId }, data: { verificationStatus: decision } });
  revalidatePath("/admin");
}

export async function verifyAgent(userId: string, decision: Decision) {
  await requireUser("ADMIN");
  await db.user.updateMany({ where: { id: userId, role: { in: ["MEASURER", "RIDER"] } }, data: { verificationStatus: decision } });
  revalidatePath("/admin");
}
