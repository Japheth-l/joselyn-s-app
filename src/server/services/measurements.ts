import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { MEASUREMENT_FIELDS } from "@/lib/enums";
import type { Actor } from "../actor";
import { invalid, notFound } from "../errors";

type Tx = Prisma.TransactionClient;
export type MeasurementValues = Record<string, { value: number; unit: "in" | "cm" }>;

/** Parse "chest=38" style form fields into validated values with units. */
export function parseMeasurementForm(form: FormData | Record<string, unknown>, unit: "in" | "cm" = "in"): MeasurementValues {
  const get = (k: string) => (form instanceof FormData ? form.get(k) : form[k]);
  const out: MeasurementValues = {};
  const max = unit === "in" ? 120 : 300;
  for (const key of Object.keys(MEASUREMENT_FIELDS)) {
    const raw = get(`m_${key}`);
    if (raw == null || raw === "") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v <= 0 || v > max) throw invalid(`${MEASUREMENT_FIELDS[key as keyof typeof MEASUREMENT_FIELDS]} must be between 0 and ${max} ${unit}.`);
    out[key] = { value: Math.round(v * 4) / 4, unit };
  }
  return out;
}

export function checkRequired(values: MeasurementValues, required: string[], min = 3) {
  const have = required.filter((k) => values[k]);
  if (have.length < Math.min(min, required.length)) {
    throw invalid(`Enter at least ${Math.min(min, required.length)} of the measurements this style needs.`);
  }
}

export async function ensureProfile(tx: Tx, ownerId: string, profileId: string | null | undefined, label = "Me") {
  if (profileId) {
    const p = await tx.measurementProfile.findFirst({ where: { id: profileId, ownerId } });
    if (!p) throw notFound("Measurement profile");
    return p;
  }
  return (await tx.measurementProfile.findFirst({ where: { ownerId, label } })) ?? tx.measurementProfile.create({ data: { ownerId, label } });
}

/** Add a new revision to a profile. Previous active revisions are marked superseded. */
export async function addRecord(tx: Tx, p: { profileId: string; values: MeasurementValues; source: string; status: string; createdById: string; appointmentId?: string; notes?: string }) {
  const last = await tx.measurementRecord.findFirst({ where: { profileId: p.profileId }, orderBy: { revision: "desc" } });
  if (p.status !== "DRAFT") {
    await tx.measurementRecord.updateMany({ where: { profileId: p.profileId, status: { in: ["SUBMITTED", "CONFIRMED"] } }, data: { status: "SUPERSEDED" } });
  }
  return tx.measurementRecord.create({
    data: {
      profileId: p.profileId, revision: (last?.revision ?? 0) + 1, values: p.values, source: p.source, status: p.status,
      createdById: p.createdById, appointmentId: p.appointmentId, notes: p.notes?.slice(0, 500) ?? "",
      confirmedAt: p.status === "CONFIRMED" ? new Date() : null,
    },
  });
}

// ── Customer-facing ──

export async function createProfile(actor: Actor, label: string) {
  const l = z.string().trim().min(1, "Give the profile a name").max(40).parse(label);
  const count = await db.measurementProfile.count({ where: { ownerId: actor.userId } });
  if (count >= 10) throw invalid("You can keep up to 10 measurement profiles.");
  return db.measurementProfile.create({ data: { ownerId: actor.userId, label: l } });
}

export async function saveOwnMeasurements(actor: Actor, profileId: string, values: MeasurementValues, notes = "") {
  if (Object.keys(values).length < 3) throw invalid("Enter at least three measurements.");
  return db.$transaction(async (tx) => {
    const p = await ensureProfile(tx, actor.userId, profileId);
    return addRecord(tx, { profileId: p.id, values, source: "SELF", status: "CONFIRMED", createdById: actor.userId, notes });
  });
}

/** The customer confirms a record taken by a professional or workshop. */
export async function confirmRecord(actor: Actor, recordId: string) {
  const r = await db.measurementRecord.findUnique({ where: { id: recordId }, include: { profile: true } });
  if (!r || r.profile.ownerId !== actor.userId) throw notFound("Measurement record");
  if (r.status !== "SUBMITTED") throw invalid("Only submitted measurements can be confirmed.");
  await db.measurementRecord.update({ where: { id: recordId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
}

export async function deleteProfile(actor: Actor, profileId: string) {
  const p = await db.measurementProfile.findFirst({ where: { id: profileId, ownerId: actor.userId }, include: { records: { include: { orders: { select: { status: true } } } } } });
  if (!p) throw notFound("Measurement profile");
  const inUse = p.records.some((r) => r.orders.some((o) => !["COMPLETED", "CANCELLED", "REFUNDED"].includes(o.status)));
  if (inUse) throw invalid("These measurements are being used by an order in progress.");
  await db.order.updateMany({ where: { measurementRecordId: { in: p.records.map((r) => r.id) } }, data: { measurementRecordId: null } });
  await db.measurementProfile.delete({ where: { id: p.id } });
}

/**
 * A measurement record is visible to its owner, to members of a business whose order uses it,
 * and to the professional who took it. Nobody else.
 */
export async function canReadRecord(actor: Actor, recordId: string) {
  const r = await db.measurementRecord.findUnique({ where: { id: recordId }, include: { profile: true, orders: { select: { businessId: true } } } });
  if (!r) return null;
  if (r.profile.ownerId === actor.userId || r.createdById === actor.userId) return r;
  if (r.orders.some((o) => o.businessId && actor.memberships.some((m) => m.businessId === o.businessId))) return r;
  return null;
}
