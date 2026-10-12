// Runs on every deploy before the app starts.
//  1. A database created by V1 (`prisma db push`) has tables but no migration history. Mark the
//     baseline migration (identical to V1) as already applied so it isn't re-run.
//  2. Apply pending migrations with `prisma migrate deploy` (never resets or drops data).
//  3. Load demo data only into an empty database and only when SEED_DEMO_DATA=true.
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const db = new PrismaClient();

try {
  const [{ has_users, has_history }] = await db.$queryRaw`
    SELECT to_regclass('public."User"') IS NOT NULL AS has_users,
           to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_history`;
  if (has_users && !has_history) {
    console.log("Existing V1 database without migration history: marking 0000_baseline as applied.");
    run("npx prisma migrate resolve --applied 0000_baseline");
  }
} finally {
  await db.$disconnect();
}

run("npx prisma migrate deploy");

if (process.env.SEED_DEMO_DATA === "true") {
  run("npx tsx prisma/seed.ts --if-empty");
}
