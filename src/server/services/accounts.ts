import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { CITIES } from "@/lib/enums";
import type { Actor } from "../actor";
import { audit } from "../audit";
import { requireAdmin } from "../authz";
import { AppError, conflict, invalid, notFound } from "../errors";
import { sendEmail } from "../notifications/channels";
import { appUrl } from "../payments";
import { rateLimit } from "../rate-limit";
import { log } from "../log";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export const phoneSchema = z.string().trim().regex(/^\+?[0-9 ]{9,15}$/, "Enter a valid phone number, e.g. 024 123 4567");
const passwordSchema = z.string().min(8, "Use at least 8 characters for your password").max(200);
const ghanaCard = z.string().trim().regex(/^GHA-?\d{9}-?\d$/i, "Enter a Ghana Card number like GHA-123456789-0");

export const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: phoneSchema,
  password: passwordSchema,
  city: z.string().refine((c) => c in CITIES, "Choose your city"),
});

/** Create a customer account. Other roles (business, measurer, rider) are added after sign-up. */
export async function signup(input: z.input<typeof signupSchema>, ip = "unknown") {
  await rateLimit(`signup:${ip}`, 10, 3600);
  const data = signupSchema.parse(input);
  if (await db.user.findUnique({ where: { email: data.email } })) throw conflict("An account with this email already exists. Try logging in.");
  const loc = CITIES[data.city];
  const user = await db.user.create({
    data: {
      name: data.name, email: data.email, phone: data.phone, city: data.city, lat: loc.lat, lng: loc.lng,
      passwordHash: await bcrypt.hash(data.password, 10),
      roles: { create: { role: "CUSTOMER" } },
    },
  });
  await sendVerificationEmail(user.id);
  return user;
}

/** Returns the user on success. Same error for unknown email and wrong password. */
export async function login(emailInput: string, password: string, ip = "unknown") {
  const email = emailInput.trim().toLowerCase();
  await rateLimit(`login:ip:${ip}`, 30, 900);
  await rateLimit(`login:email:${email}`, 8, 900);
  const user = await db.user.findUnique({ where: { email } });
  // Compare against a dummy hash for unknown emails so response time doesn't reveal which emails exist.
  const ok = await bcrypt.compare(password, user && user.passwordHash.startsWith("$2") ? user.passwordHash : DUMMY_HASH);
  if (!user || !ok) throw new AppError("Wrong email or password.", "INVALID");
  if (user.status === "SUSPENDED") throw new AppError("This account is suspended. Contact support for help.", "FORBIDDEN");
  if (user.status === "DELETED") throw new AppError("Wrong email or password.", "INVALID");
  return user;
}

function newToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, hash: crypto.createHash("sha256").update(token).digest("hex") };
}

async function issueToken(userId: string, purpose: "VERIFY_EMAIL" | "RESET_PASSWORD", hours: number) {
  const { token, hash } = newToken();
  await db.authToken.create({ data: { userId, purpose, tokenHash: hash, expiresAt: new Date(Date.now() + hours * 3_600_000) } });
  return token;
}

async function useToken(token: string, purpose: string) {
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const t = await db.authToken.findUnique({ where: { tokenHash: hash } });
  if (!t || t.purpose !== purpose || t.usedAt || t.expiresAt < new Date()) throw invalid("This link has expired or was already used. Request a new one.");
  const claimed = await db.authToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count === 0) throw invalid("This link was already used.");
  return t;
}

/** Sends the link if email is configured; in development the link is logged instead. */
export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return { sent: false as const, reason: "already" };
  await rateLimit(`verify-email:${userId}`, 5, 3600);
  const token = await issueToken(userId, "VERIFY_EMAIL", 48);
  const link = `${appUrl()}/verify-email?token=${token}`;
  const r = await sendEmail(user.email, `Confirm your ${BRAND.name} email`, `Hello ${user.name},\n\nConfirm your email address: ${link}\n\nThis link expires in 48 hours.`);
  if (r.status === "SKIPPED" && process.env.NODE_ENV !== "production") log.info("auth.verify_link", { email: user.email, link });
  return { sent: r.status === "SENT", reason: r.status };
}

export async function verifyEmail(token: string) {
  const t = await useToken(token, "VERIFY_EMAIL");
  await db.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } });
}

/** Always behaves the same whether or not the email exists, so accounts can't be discovered. */
export async function requestPasswordReset(emailInput: string, ip = "unknown") {
  const email = emailInput.trim().toLowerCase();
  await rateLimit(`reset:ip:${ip}`, 10, 3600);
  await rateLimit(`reset:email:${email}`, 3, 3600);
  const user = await db.user.findUnique({ where: { email } });
  if (!user || user.status !== "ACTIVE") return;
  const token = await issueToken(user.id, "RESET_PASSWORD", 1);
  const link = `${appUrl()}/reset-password?token=${token}`;
  const r = await sendEmail(user.email, `Reset your ${BRAND.name} password`, `Hello ${user.name},\n\nReset your password: ${link}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`);
  if (r.status === "SKIPPED" && process.env.NODE_ENV !== "production") log.info("auth.reset_link", { email: user.email, link });
}

/** Sets a new password and signs out every existing session. */
export async function resetPassword(token: string, password: string) {
  const pw = passwordSchema.parse(password);
  const t = await useToken(token, "RESET_PASSWORD");
  await db.user.update({ where: { id: t.userId }, data: { passwordHash: await bcrypt.hash(pw, 10), sessionVersion: { increment: 1 }, emailVerifiedAt: new Date() } });
  await audit(t.userId, "auth.password_reset", { type: "User", id: t.userId });
}

export async function changePassword(actor: Actor, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await bcrypt.compare(current, user.passwordHash))) throw invalid("Your current password is wrong.");
  const pw = passwordSchema.parse(next);
  const u = await db.user.update({ where: { id: actor.userId }, data: { passwordHash: await bcrypt.hash(pw, 10), sessionVersion: { increment: 1 } } });
  await audit(actor.userId, "auth.password_changed", { type: "User", id: actor.userId });
  return u.sessionVersion;
}

export async function logoutEverywhere(actor: Actor) {
  await db.user.update({ where: { id: actor.userId }, data: { sessionVersion: { increment: 1 } } });
}

const profileSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneSchema,
  city: z.string().refine((c) => c in CITIES, "Choose your city"),
});

export async function updateProfile(actor: Actor, input: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(input);
  const loc = CITIES[data.city];
  await db.user.update({ where: { id: actor.userId }, data: { ...data, lat: loc.lat, lng: loc.lng } });
}

export async function updateNotificationPrefs(actor: Actor, prefs: { sms: boolean; email: boolean; whatsapp: boolean }) {
  await db.user.update({ where: { id: actor.userId }, data: { notificationPrefs: prefs } });
}

const addressSchema = z.object({
  label: z.string().trim().min(1, "Give the address a name, like Home").max(40),
  addressText: z.string().trim().min(3, "Enter an address or landmark").max(300),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export async function addAddress(actor: Actor, input: z.input<typeof addressSchema>) {
  const data = addressSchema.parse(input);
  const count = await db.savedAddress.count({ where: { userId: actor.userId } });
  if (count >= 10) throw invalid("You can save up to 10 addresses.");
  return db.savedAddress.create({ data: { ...data, userId: actor.userId } });
}

export async function removeAddress(actor: Actor, id: string) {
  const res = await db.savedAddress.deleteMany({ where: { id, userId: actor.userId } });
  if (res.count === 0) throw notFound("Address");
}

const VEHICLES = ["MOTORBIKE", "CAR", "BICYCLE", "ON_FOOT"];
function checkFee(feeCedis: number | undefined) {
  if (feeCedis != null && !(Number.isFinite(feeCedis) && feeCedis >= 0 && feeCedis <= 10_000)) throw invalid("Enter a fee between GH₵ 0 and GH₵ 10,000.");
}

/** Add the measurement professional or rider role and open a verification application. */
export async function applyAsAgent(actor: Actor, kind: "MEASURER" | "RIDER", input: { ghanaCardNumber: string; experience?: string; vehicle?: string; feeCedis?: number; serviceRadiusKm?: number }, documentIds: string[] = []) {
  if (actor.agents.some((a) => a.kind === kind)) throw conflict("You have already applied for this role.");
  const card = ghanaCard.parse(input.ghanaCardNumber).toUpperCase();
  if (kind === "RIDER" && input.vehicle && !VEHICLES.includes(input.vehicle)) throw invalid("Choose how you travel.");
  checkFee(input.feeCedis);
  const radius = z.number().int().min(1, "Service radius must be 1–100 km").max(100, "Service radius must be 1–100 km").parse(input.serviceRadiusKm ?? 15);
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  await db.$transaction(async (tx) => {
    await tx.roleAssignment.upsert({ where: { userId_role: { userId: actor.userId, role: kind } }, create: { userId: actor.userId, role: kind }, update: {} });
    await tx.agentProfile.create({
      data: {
        userId: actor.userId, kind, ghanaCardNumber: card, experience: input.experience?.slice(0, 1000) ?? "",
        vehicle: kind === "RIDER" ? input.vehicle ?? "MOTORBIKE" : null,
        feeMinor: kind === "MEASURER" && input.feeCedis ? Math.round(input.feeCedis * 100) : null,
        serviceLat: user.lat, serviceLng: user.lng, serviceRadiusKm: radius,
      },
    });
    await tx.verificationApplication.create({
      data: { subjectType: kind, applicantId: actor.userId, details: { ghanaCardNumber: card, experience: input.experience ?? "", vehicle: input.vehicle ?? null }, documentIds },
    });
  });
}

export async function updateAgentProfile(actor: Actor, kind: "MEASURER" | "RIDER", input: { available: boolean; serviceRadiusKm: number; feeCedis?: number; lat?: number; lng?: number }) {
  const radius = z.number().int().min(1).max(100).parse(input.serviceRadiusKm);
  checkFee(input.feeCedis);
  const res = await db.agentProfile.updateMany({
    where: { userId: actor.userId, kind },
    data: {
      available: input.available, serviceRadiusKm: radius,
      ...(kind === "MEASURER" && input.feeCedis != null ? { feeMinor: Math.round(input.feeCedis * 100) } : {}),
      ...(input.lat != null && input.lng != null ? { serviceLat: input.lat, serviceLng: input.lng } : {}),
    },
  });
  if (res.count === 0) throw notFound("Profile");
}

/** Everything we hold about the person, as JSON (Data Protection Act right of access). */
export async function exportMyData(actor: Actor) {
  const data = await db.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: {
      id: true, name: true, email: true, phone: true, city: true, createdAt: true, notificationPrefs: true,
      roles: { select: { role: true, createdAt: true } },
      addresses: true,
      customerOrders: { select: { number: true, status: true, totalMinor: true, createdAt: true, instructions: true, designChoices: true } },
      measurementProfiles: { include: { records: true } },
      reviews: { select: { rating: true, comment: true, createdAt: true } },
      memberships: { select: { role: true, business: { select: { name: true } } } },
    },
  });
  await audit(actor.userId, "privacy.export", { type: "User", id: actor.userId });
  return data;
}

/**
 * Delete an account. Personal details are removed; orders, payments and the ledger are kept
 * (anonymised) because financial records must be retained.
 */
export async function deleteMyAccount(actor: Actor, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.userId } });
  if (!(await bcrypt.compare(password, user.passwordHash))) throw invalid("Your password is wrong.");
  const open = await db.order.count({ where: { customerId: actor.userId, status: { notIn: ["DRAFT", "COMPLETED", "CANCELLED", "REFUNDED"] } } });
  if (open > 0) throw conflict("You have orders in progress. Finish or cancel them before deleting your account.");
  if (actor.memberships.some((m) => m.role === "OWNER")) throw conflict("Transfer or close your business before deleting your account.");
  await db.$transaction(async (tx) => {
    await tx.measurementProfile.deleteMany({ where: { ownerId: actor.userId } });
    await tx.savedAddress.deleteMany({ where: { userId: actor.userId } });
    await tx.authToken.deleteMany({ where: { userId: actor.userId } });
    await tx.order.updateMany({ where: { customerId: actor.userId }, data: { addressText: null, lat: null, lng: null, instructions: "" } });
    await tx.user.update({
      where: { id: actor.userId },
      data: {
        status: "DELETED", name: "Deleted user", email: `deleted-${actor.userId}@deleted.invalid`, phone: "", city: null, lat: null, lng: null,
        passwordHash: "!", sessionVersion: { increment: 1 }, notificationPrefs: { sms: false, email: false, whatsapp: false },
      },
    });
    await audit(actor.userId, "privacy.delete_account", { type: "User", id: actor.userId }, {}, tx);
  });
}

// ── Administration of users ──

export async function setUserStatus(actor: Actor, userId: string, status: "ACTIVE" | "SUSPENDED", reason: string) {
  requireAdmin(actor, "USERS");
  if (userId === actor.userId) throw invalid("You can't change your own account status.");
  if (!reason.trim()) throw invalid("Give a reason.");
  await db.user.update({ where: { id: userId }, data: { status, sessionVersion: { increment: 1 } } });
  await audit(actor.userId, status === "SUSPENDED" ? "user.suspend" : "user.reinstate", { type: "User", id: userId }, { reason });
}

export async function setAdminPermissions(actor: Actor, userId: string, permissions: string[]) {
  requireAdmin(actor, "SUPER");
  if (userId === actor.userId) throw invalid("You can't change your own permissions.");
  const allowed = ["SUPER", "USERS", "VERIFY", "CATALOGUE", "ORDERS", "DISPUTES", "FINANCE", "CONFIG", "AUDIT"];
  const perms = permissions.filter((p) => allowed.includes(p));
  if (perms.length === 0) await db.roleAssignment.deleteMany({ where: { userId, role: "ADMIN" } });
  else await db.roleAssignment.upsert({ where: { userId_role: { userId, role: "ADMIN" } }, create: { userId, role: "ADMIN", permissions: perms }, update: { permissions: perms } });
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  await audit(actor.userId, "user.admin_permissions", { type: "User", id: userId }, { permissions: perms });
}
