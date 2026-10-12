import { db } from "@/lib/db";
import type { Actor } from "../actor";
import { notFound } from "../errors";

// In-app notifications. People only ever touch their own rows.

export async function markAllRead(actor: Actor) {
  await db.notification.updateMany({ where: { userId: actor.userId, read: false }, data: { read: true } });
}

export async function markRead(actor: Actor, notificationId: string) {
  const res = await db.notification.updateMany({ where: { id: notificationId, userId: actor.userId }, data: { read: true } });
  if (res.count === 0) throw notFound("Notification");
}
