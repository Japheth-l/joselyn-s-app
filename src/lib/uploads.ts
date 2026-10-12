import "server-only";
import crypto from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

// Photos are stored on disk in UPLOAD_DIR and served from /uploads/<name>.
// For production on several servers, swap this for object storage (e.g. S3 or Cloudflare R2).
const MAX_BYTES = 3 * 1024 * 1024;
const TYPES = [
  { ext: "jpg", mime: "image/jpeg", magic: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "png", mime: "image/png", magic: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: "webp", mime: "image/webp", magic: (b: Buffer) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
];

const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || "./uploads");

/** Save an uploaded photo. Returns its public URL, or null if no file was chosen. */
export async function saveImage(file: FormDataEntryValue | null): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new Error("Photos must be smaller than 3 MB.");
  const buf = Buffer.from(await file.arrayBuffer());
  // Check the file's actual bytes, not the name or browser-reported type.
  const type = TYPES.find((t) => t.magic(buf));
  if (!type) throw new Error("Please upload a JPG, PNG or WebP photo.");
  const name = `${crypto.randomBytes(12).toString("hex")}.${type.ext}`;
  await mkdir(uploadDir(), { recursive: true });
  await writeFile(path.join(uploadDir(), name), buf);
  return `/uploads/${name}`;
}

export async function readImage(name: string) {
  // Only names we generated: hex + known extension, so no path tricks.
  const m = /^[a-f0-9]{24}\.(jpg|png|webp)$/.exec(name);
  if (!m) return null;
  try {
    const data = await readFile(path.join(uploadDir(), name));
    return { data, mime: TYPES.find((t) => t.ext === m[1])!.mime };
  } catch {
    return null;
  }
}
