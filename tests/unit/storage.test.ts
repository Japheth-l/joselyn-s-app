import { NoSuchBucket, NoSuchKey, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetStorageForTests, storage } from "@/server/storage";

const S3_ENV = { STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "id", S3_SECRET_ACCESS_KEY: "secret", S3_ENDPOINT: "https://example.r2.cloudflarestorage.com" };
const saved = { ...process.env };

beforeEach(() => {
  resetStorageForTests();
  Object.assign(process.env, S3_ENV);
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of Object.keys(S3_ENV)) delete process.env[k];
  Object.assign(process.env, saved);
  resetStorageForTests();
});

describe("storage driver selection", () => {
  it("refuses s3 without its credentials instead of sending unsigned requests", () => {
    delete process.env.S3_SECRET_ACCESS_KEY;
    expect(() => storage()).toThrow("S3_SECRET_ACCESS_KEY not set");
  });

  it("refuses an unknown driver instead of silently using the local disk", () => {
    process.env.STORAGE_DRIVER = "r2";
    expect(() => storage()).toThrow('Unknown STORAGE_DRIVER "r2"');
  });
});

describe("s3 driver get()", () => {
  const meta = (status: number) => ({ $metadata: { httpStatusCode: status } });

  it("returns null for a missing object", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(new NoSuchKey({ message: "missing", ...meta(404) }));
    expect(await storage().get("public/x.jpg")).toBeNull();
  });

  it.each([
    ["a missing bucket", () => new NoSuchBucket({ message: "no bucket", ...meta(404) })],
    ["wrong credentials", () => new S3ServiceException({ name: "AccessDenied", $fault: "client", message: "denied", ...meta(403) })],
    ["a network failure", () => Object.assign(new Error("connect ECONNREFUSED"), { name: "Error" })],
  ])("throws on %s rather than reporting the file as missing", async (_label, error) => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(error());
    await expect(storage().get("public/x.jpg")).rejects.toThrow();
  });

  it("asks the SDK for checksums only when required (Cloudflare R2 compatibility)", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    await storage().put("public/x.jpg", Buffer.from("x"), "image/jpeg");
    const config = (send.mock.contexts[0] as S3Client).config;
    expect(await config.requestChecksumCalculation()).toBe("WHEN_REQUIRED");
    expect(await config.responseChecksumValidation()).toBe("WHEN_REQUIRED");
  });
});
