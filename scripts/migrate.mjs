// Runs before `next start` on every deploy (npm run deploy:start). Exits non-zero, so the app does not start,
// when anything is wrong; Render then keeps the previous deploy running.
//
// 1. Refuses a V1 database unless ALLOW_V1_CONVERSION=true. V2 launches on a new, empty database; converting
//    the V1 database in place (0001_v2) must be a deliberate decision, never the result of a wrong DATABASE_URL.
// 2. `prisma migrate deploy` applies pending migrations. It never resets or drops anything.
// 3. SEED_ON_EMPTY=catalogue-and-admin: if the database has no users, seeds the style catalogue and one
//    administrator from ADMIN_EMAIL / ADMIN_PASSWORD (both required). Never seeds demo data.
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const seedMode = process.env.SEED_ON_EMPTY ?? "";
if (!["", "catalogue-and-admin"].includes(seedMode)) {
  fail(`SEED_ON_EMPTY must be "catalogue-and-admin" or unset (got "${seedMode}").`);
}
if (process.env.SEED_DEMO_DATA !== undefined) {
  console.warn("SEED_DEMO_DATA is no longer used and is ignored: deploys never seed demo data. Remove it.");
}

const db = new PrismaClient();
let v1Database = false;
let hasHistory = false;
try {
  const [{ has_users, has_history }] = await db.$queryRaw`
    SELECT to_regclass('public."User"') IS NOT NULL AS has_users,
           to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_history`;
  hasHistory = has_history;
  if (has_users) {
    const [{ v2_applied }] = has_history
      ? await db.$queryRaw`SELECT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE migration_name = '0001_v2'
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL) AS v2_applied`
      : [{ v2_applied: false }];
    // An empty schema left by a failed first V2 attempt has no users; V1 always had its own tables first.
    const [{ user_rows }] = await db.$queryRaw`SELECT EXISTS (SELECT 1 FROM "User") AS user_rows`;
    v1Database = !v2_applied && (!has_history || user_rows);
  }
} finally {
  await db.$disconnect();
}

if (v1Database) {
  if (process.env.ALLOW_V1_CONVERSION !== "true") {
    fail(
      "This database holds V1 data. V2 is meant to start on a new, empty database, so nothing was changed.\n" +
        "Check that DATABASE_URL points at the V2 database. To convert this V1 database in place instead, back it up,\n" +
        "follow docs/MIGRATION_REHEARSAL.md and deploy once with ALLOW_V1_CONVERSION=true.",
    );
  }
  console.log("ALLOW_V1_CONVERSION=true: converting this V1 database to V2.");
  if (!hasHistory) {
    console.log("No migration history: marking 0000_baseline (identical to V1) as applied.");
    run("npx prisma migrate resolve --applied 0000_baseline");
  }
}

run("npx prisma migrate deploy");

if (seedMode === "catalogue-and-admin") {
  run("npx tsx prisma/seed.ts --if-empty --no-demo --require-admin");
}
