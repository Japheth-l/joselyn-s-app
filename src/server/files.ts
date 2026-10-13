import crypto from "crypto";
import { db } from "@/lib/db";
import type { Actor } from "./actor";
import { isAdmin } from "./authz";
import { invalid } from "./errors";
import { rateLimit } from "./rate-limit";
import { storage } from "./storage";

const TYPES = [
  { ext: "jpg", mime: "image/jpeg", image: true, magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", image: true, magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", mime: "image/webp", image: true, magic: (b: Buffer) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  { ext: "pdf", mime: "application/pdf", image: false, magic: (b: Buffer) => b.toString("ascii", 0, 5) === "%PDF-" },
];

export type Purpose = "STYLE" | "FABRIC" | "PORTFOLIO" | "REFERENCE" | "VERIFICATION" | "MESSAGE" | "DISPUTE";
const PRIVATE: Purpose[] = ["VERIFICATION", "MESSAGE", "DISPUTE", "REFERENCE"];
const MAX_BYTES = 5 * 1024 * 1024;

/** Validate by content (not name or browser type), store under a random key, and record it. */
export async function saveUpload(actor: Actor, entry: FormDataEntryValue | null, opts: { purpose: Purpose; orderId?: string; allowPdf?: boolean }) {
  if (!(entry instanceof File) || entry.size === 0) return null;
  await rateLimit(`upload:${actor.userId}`, 60, 3600);
  if (entry.size > MAX_BYTES) throw invalid("Files must be smaller than 5 MB.");
  const data = Buffer.from(await entry.arrayBuffer());
  const type = TYPES.find((t) => t.magic(data));
  if (!type || (!type.image && !opts.allowPdf)) throw invalid(opts.allowPdf ? "Upload a JPG, PNG, WebP or PDF file." : "Upload a JPG, PNG or WebP photo.");
  const visibility = PRIVATE.includes(opts.purpose) ? "PRIVATE" : "PUBLIC";
  const key = `${visibility.toLowerCase()}/${crypto.randomBytes(16).toString("hex")}.${type.ext}`;
  await storage().put(key, data, type.mime);
  return db.storedFile.create({
    data: { ownerId: actor.userId, visibility, purpose: opts.purpose, storageKey: key, mime: type.mime, size: data.length, orderId: opts.orderId },
  });
}

export async function saveUploads(actor: Actor, entries: FormDataEntryValue[], opts: Parameters<typeof saveUpload>[2], max = 5) {
  const files = entries.filter((e): e is File => e instanceof File && e.size > 0);
  if (files.length > max) throw invalid(`Attach at most ${max} files.`);
  const out = [];
  for (const f of files) out.push((await saveUpload(actor, f, opts))!);
  return out;
}

export function publicUrl(file: { storageKey: string }) {
  return `/uploads/${file.storageKey.replace(/^public\//, "")}`;
}

export function privateUrl(file: { id: string }) {
  return `/files/${file.id}`;
}

/** Who may open a private file. */
export async function canReadFile(actor: Actor, fileId: string) {
  const f = await db.storedFile.findUnique({ where: { id: fileId } });
  if (!f) return null;
  if (f.visibility === "PUBLIC" || f.ownerId === actor.userId) return f;
  if (f.purpose === "VERIFICATION" && isAdmin(actor, "VERIFY")) return f;
  if (f.purpose === "DISPUTE" && isAdmin(actor, "DISPUTES")) return f;
  if (f.orderId) {
    const { loadOrderAccess, relationsFor } = await import("./order-flow");
    const order = await loadOrderAccess(db, f.orderId).catch(() => null);
    if (order && relationsFor(actor, order).length > 0) return f;
  }
  return null;
}
