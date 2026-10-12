import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

// File storage driver. STORAGE_DRIVER=local keeps files on disk (fine for development; NOT for hosts with
// an ephemeral filesystem such as Render's free plan). STORAGE_DRIVER=s3 uses any S3-compatible bucket
// (Cloudflare R2, AWS S3, Backblaze B2). The bucket should be private: the app streams files itself and
// checks permissions for private ones.

export interface Storage {
  put(key: string, data: Buffer, mime: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  remove(key: string): Promise<void>;
}

const local = (): Storage => {
  const dir = path.resolve(process.env.UPLOAD_DIR || "./uploads");
  const file = (key: string) => {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes("..")) throw new Error("Bad storage key");
    return path.join(dir, key);
  };
  return {
    async put(key, data) {
      await mkdir(path.dirname(file(key)), { recursive: true });
      await writeFile(file(key), data);
    },
    async get(key) {
      try {
        return await readFile(file(key));
      } catch {
        return null;
      }
    },
    async remove(key) {
      await unlink(file(key)).catch(() => {});
    },
  };
};

const s3 = (): Storage => {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not set");
  const client = new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "" },
    forcePathStyle: !!process.env.S3_ENDPOINT,
  });
  return {
    async put(key, data, mime) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: mime }));
    },
    async get(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : null;
      } catch {
        return null;
      }
    },
    async remove(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
};

let instance: Storage | null = null;
export function storage(): Storage {
  if (!instance) instance = process.env.STORAGE_DRIVER === "s3" ? s3() : local();
  return instance;
}
