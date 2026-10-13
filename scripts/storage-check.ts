// Checks the configured file storage (STORAGE_DRIVER, S3_*) with the same driver the app uses.
//
//   npm run storage:check                   write, read back, compare, delete, confirm a missing key reads as missing
//   npm run storage:check -- write <name>   write checks/<name>.txt and print its SHA-256 (left in place)
//   npm run storage:check -- read <name> <sha256>   read checks/<name>.txt and compare (after a restart or redeploy)
//   npm run storage:check -- remove <name>
//
// Prints the driver, bucket and endpoint host, never credentials. Exit code 0 only if every step passed.
import crypto from "crypto";
import { storage } from "../src/server/storage";

const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");
const key = (name: string) => {
  if (!/^[a-z0-9-]{1,64}$/i.test(name)) throw new Error("name: letters, digits and dashes only");
  return `checks/${name}.txt`;
};
const pass = (msg: string) => console.log(`PASS  ${msg}`);
const fail = (msg: string) => {
  console.log(`FAIL  ${msg}`);
  process.exitCode = 1;
};

function describeTarget() {
  const driver = process.env.STORAGE_DRIVER || "local";
  if (driver !== "s3") return `local disk (${process.env.UPLOAD_DIR || "./uploads"})`;
  const endpoint = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).host : "AWS S3";
  return `s3 bucket "${process.env.S3_BUCKET}" at ${endpoint}`;
}

async function roundTrip() {
  const s = storage();
  const k = key(`roundtrip-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  const body = crypto.randomBytes(64 * 1024);
  await s.put(k, body, "application/octet-stream");
  pass(`wrote ${k} (${body.length} bytes)`);
  const back = await s.get(k);
  if (back && sha(back) === sha(body)) pass("read it back, identical");
  else fail(`read back ${back ? "different bytes" : "nothing"}`);
  await s.remove(k);
  const gone = await s.get(k);
  if (gone === null) pass("deleted it; reading it now returns 'not found'");
  else fail("object still readable after delete");
  if ((await s.get(key(`never-written-${crypto.randomBytes(6).toString("hex")}`))) === null) pass("a key that never existed reads as 'not found'");
  else fail("a key that never existed returned data");
}

async function main() {
  const [mode = "roundtrip", name, expected] = process.argv.slice(2);
  console.log(`Storage: ${describeTarget()}`);
  const s = storage();
  if (mode === "roundtrip") return roundTrip();
  if (!name) throw new Error("missing <name>");
  if (mode === "write") {
    const body = Buffer.from(`ntoma storage check ${name} ${new Date().toISOString()} ${crypto.randomBytes(16).toString("hex")}\n`);
    await s.put(key(name), body, "text/plain");
    pass(`wrote ${key(name)}; sha256 ${sha(body)}`);
  } else if (mode === "read") {
    const back = await s.get(key(name));
    if (!back) fail(`${key(name)} not found`);
    else if (expected && sha(back) !== expected) fail(`${key(name)} has different contents (sha256 ${sha(back)})`);
    else pass(`read ${key(name)}; sha256 ${sha(back)}${expected ? " matches" : ""}`);
  } else if (mode === "remove") {
    await s.remove(key(name));
    pass(`removed ${key(name)}`);
  } else {
    throw new Error(`unknown mode "${mode}"`);
  }
}

main().catch((e) => {
  // SDK errors carry a name and HTTP status; print those, not the request (which includes signed headers).
  const status = e?.$metadata?.httpStatusCode;
  console.log(`FAIL  ${e?.name ?? "Error"}${status ? ` (HTTP ${status})` : ""}: ${e?.message ?? e}`);
  process.exit(1);
});
