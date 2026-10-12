import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { log } from "../log";
import { sendEmail, sendSms, sendWhatsApp } from "./channels";
import { renderTemplate, type TemplateKey } from "./templates";

type Prefs = { sms?: boolean; email?: boolean; whatsapp?: boolean };

/**
 * Notify a person: always in-app, plus SMS/email/WhatsApp according to their preferences. Each
 * outbound attempt is recorded with its real outcome. Never throws: a failed message must not undo
 * the action that triggered it.
 */
export async function notify(userId: string, key: TemplateKey, vars: Record<string, string | number>, opts: { link?: string; orderId?: string } = {}) {
  try {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user || user.status === "DELETED") return;
    const message = await renderTemplate(key, vars);
    const n = await db.notification.create({ data: { userId, type: key, message, link: opts.link ?? "", orderId: opts.orderId } });
    const prefs = (user.notificationPrefs ?? {}) as Prefs;
    const attempts: Promise<void>[] = [];
    const record = (channel: string) => (r: { status: string; providerMessageId?: string; error?: string }) =>
      db.notificationDelivery.create({ data: { notificationId: n.id, channel, status: r.status, providerMessageId: r.providerMessageId, error: r.error } }).then(() => {});
    if (prefs.sms !== false) attempts.push(sendSms(user.phone, `${BRAND.name}: ${message}`).then(record("SMS")));
    if (prefs.email !== false) attempts.push(sendEmail(user.email, `${BRAND.name} update`, message).then(record("EMAIL")));
    if (prefs.whatsapp) attempts.push(sendWhatsApp().then(record("WHATSAPP")));
    await Promise.all(attempts);
  } catch (e) {
    log.error("notify.failed", { key, error: e instanceof Error ? e.message : String(e) });
  }
}

export async function notifyMany(userIds: string[], key: TemplateKey, vars: Record<string, string | number>, opts: { link?: string; orderId?: string } = {}) {
  for (const id of [...new Set(userIds)]) await notify(id, key, vars, opts);
}

/** Notify everyone who manages a business (owners and managers). */
export async function notifyBusiness(businessId: string, key: TemplateKey, vars: Record<string, string | number>, opts: { link?: string; orderId?: string } = {}) {
  const members = await db.membership.findMany({ where: { businessId, role: { in: ["OWNER", "MANAGER"] } } });
  await notifyMany(members.map((m) => m.userId), key, vars, opts);
}
