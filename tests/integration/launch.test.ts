import { execSync, spawnSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

// The production start-up path (scripts/migrate.mjs, run by `npm run deploy:start`) against brand-new LOCAL
// databases, exactly as Render runs it on the V2 database. Each test gets its own database.

const ROOT = path.resolve(__dirname, "../..");
const SERVER = (process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/ntoma_test").replace(/\/[^/]*$/, "");
const ADMIN = { ADMIN_EMAIL: "Owner@Ntoma-Launch.test", ADMIN_PASSWORD: "correct-horse-battery-staple" };
const clients: PrismaClient[] = [];
let n = 0;

function freshDatabase() {
  const url = `${SERVER}/ntoma_launch_${process.pid}_${n++}`;
  execSync(`sh scripts/reset-local-db.sh ${url}`, { cwd: ROOT, stdio: "ignore" });
  const client = new PrismaClient({ datasourceUrl: url });
  clients.push(client);
  return { url, db: client };
}

// Runs a command with only the variables given (plus PATH/HOME), as a deploy would: nothing leaks in from the
// developer's shell or the test setup.
function run(cmd: string, env: Record<string, string | undefined>) {
  const r = spawnSync("sh", ["-c", cmd], {
    cwd: ROOT,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } as unknown as NodeJS.ProcessEnv,
  });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}
const deployStart = (env: Record<string, string | undefined>) => run("node scripts/migrate.mjs", env);

async function counts(db: PrismaClient) {
  const [users, demoUsers, businesses, styles, categories, migrations] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isDemo: true } }),
    db.business.count(),
    db.style.count(),
    db.garmentCategory.count(),
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`.then((r) => Number(r[0].n)),
  ]);
  return { users, demoUsers, businesses, styles, categories, migrations };
}

afterAll(async () => {
  await Promise.all(clients.map((c) => c.$disconnect()));
  for (let i = 0; i < n; i++) {
    execSync(`psql "${SERVER}/postgres" -X -q -c 'DROP DATABASE IF EXISTS "ntoma_launch_${process.pid}_${i}" WITH (FORCE)'`, { stdio: "ignore" });
  }
});

describe("first start on a new, empty database", () => {
  it("creates the schema, the catalogue and exactly one administrator, and never demo data", async () => {
    const { url, db } = freshDatabase();
    // SEED_DEMO_DATA=true is what V1's settings still hold on Render: it must be ignored.
    const r = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "catalogue-and-admin", SEED_DEMO_DATA: "true", ...ADMIN });
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain("SEED_DEMO_DATA is no longer used and is ignored");
    expect(r.output).toContain("All migrations have been successfully applied");
    expect(r.output).not.toContain(ADMIN.ADMIN_PASSWORD);

    expect(await counts(db)).toEqual({ users: 1, demoUsers: 0, businesses: 0, styles: 15, categories: 10, migrations: 2 });
    expect(await db.user.count({ where: { email: { contains: "demo" } } })).toBe(0);
    expect(await db.fabricListing.count()).toBe(0);

    const admin = await db.user.findUniqueOrThrow({ where: { email: "owner@ntoma-launch.test" }, include: { roles: true } });
    expect(admin.isDemo).toBe(false);
    expect(admin.roles.find((r) => r.role === "ADMIN")?.permissions).toEqual(["SUPER"]);
    expect(await bcrypt.compare(ADMIN.ADMIN_PASSWORD, admin.passwordHash)).toBe(true);
    expect(await bcrypt.compare("local-admin-password", admin.passwordHash)).toBe(false);

    // Restart (Render restarts, redeploys and free-plan wake-ups all run the start command again).
    const before = await counts(db);
    const again = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "catalogue-and-admin", ...ADMIN });
    expect(again.status, again.output).toBe(0);
    expect(again.output).toContain("No pending migrations to apply");
    expect(again.output).toContain("Database already has users; skipping the seed.");
    expect(await counts(db)).toEqual(before);
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash).toBe(admin.passwordHash);

    // A later restart without the admin variables is not blocked: they only matter for an empty database.
    const withoutAdmin = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "catalogue-and-admin" });
    expect(withoutAdmin.status, withoutAdmin.output).toBe(0);
    expect(await counts(db)).toEqual(before);
  }, 120_000);

  it.each([
    ["ADMIN_EMAIL missing", { ADMIN_PASSWORD: ADMIN.ADMIN_PASSWORD }, "ADMIN_EMAIL is not set"],
    ["ADMIN_PASSWORD missing", { ADMIN_EMAIL: ADMIN.ADMIN_EMAIL }, "ADMIN_PASSWORD is not set"],
    ["both missing", {}, "ADMIN_EMAIL is not set; ADMIN_PASSWORD is not set"],
    ["password too short", { ADMIN_EMAIL: ADMIN.ADMIN_EMAIL, ADMIN_PASSWORD: "short-pw" }, "shorter than 12 characters"],
    ["development password", { ADMIN_EMAIL: ADMIN.ADMIN_EMAIL, ADMIN_PASSWORD: "local-admin-password" }, "known default"],
    ["development email", { ADMIN_EMAIL: "admin@ntoma.example", ADMIN_PASSWORD: ADMIN.ADMIN_PASSWORD }, "must not be the development address"],
  ])("refuses to start with %s, and creates no account", async (_label, admin, message) => {
    const { url, db } = freshDatabase();
    const r = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "catalogue-and-admin", ...admin });
    expect(r.status).not.toBe(0);
    expect(r.output).toContain(message);
    if ("ADMIN_PASSWORD" in admin && admin.ADMIN_PASSWORD) expect(r.output).not.toContain(admin.ADMIN_PASSWORD);
    const c = await counts(db);
    expect({ users: c.users, styles: c.styles }).toEqual({ users: 0, styles: 0 }); // checked before anything is written
    // Fixing the variable and starting again completes the launch.
    const fixed = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "catalogue-and-admin", ...ADMIN });
    expect(fixed.status, fixed.output).toBe(0);
    expect((await counts(db)).users).toBe(1);
  }, 120_000);

  it("rejects an unknown SEED_ON_EMPTY value before touching the database", async () => {
    const { url, db } = freshDatabase();
    const r = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "demo", ...ADMIN });
    expect(r.status).not.toBe(0);
    expect(r.output).toContain('SEED_ON_EMPTY must be "catalogue-and-admin" or unset');
    const [{ t }] = await db.$queryRaw<{ t: string | null }[]>`SELECT to_regclass('public."_prisma_migrations"')::text AS t`;
    expect(t).toBeNull();
  }, 60_000);

  it("without SEED_ON_EMPTY only migrates", async () => {
    const { url, db } = freshDatabase();
    const r = deployStart({ DATABASE_URL: url });
    expect(r.status, r.output).toBe(0);
    expect(await counts(db)).toMatchObject({ users: 0, styles: 0, categories: 10, migrations: 2 });
  }, 60_000);
});

describe("demo data", () => {
  it("the seed refuses demo data for a database that is not on this machine, before connecting", () => {
    const r = run("npx tsx prisma/seed.ts", { DATABASE_URL: "postgresql://user:pw@dpg-example-a.frankfurt-postgres.render.com/ntoma", ...ADMIN });
    expect(r.status).not.toBe(0);
    expect(r.output).toContain("Demo data is only seeded into a local database");
  }, 60_000);

  it("the deploy seed never includes demo data, even on a local database", () => {
    const script = readFileSync(path.join(ROOT, "scripts/migrate.mjs"), "utf8");
    const seedCalls = script.split("\n").filter((l) => l.includes("prisma/seed.ts") && !l.trim().startsWith("//"));
    expect(seedCalls).toHaveLength(1);
    expect(seedCalls[0]).toContain("--no-demo");
    expect(seedCalls[0]).toContain("--require-admin");
  });
});

describe("V1 database guard", () => {
  async function v1Database() {
    const fresh = freshDatabase();
    execSync(`psql "${fresh.url}" -X -q -v ON_ERROR_STOP=1 -f prisma/migrations/0000_baseline/migration.sql`, { cwd: ROOT, stdio: "ignore" });
    await fresh.db.$executeRaw`INSERT INTO "User" (id, name, email, phone, "passwordHash", role) VALUES ('v1user', 'V1 user', 'v1@example.com', '0240000000', 'x', 'CUSTOMER')`;
    return fresh;
  }
  const tables = (db: PrismaClient) =>
    db.$queryRaw<{ t: string }[]>`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`.then((r) => r.map((x) => x.t));

  it("refuses to convert a V1 database and changes nothing", async () => {
    const { url, db } = await v1Database();
    const before = await tables(db);
    const r = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "catalogue-and-admin", ...ADMIN });
    expect(r.status).not.toBe(0);
    expect(r.output).toContain("This database holds V1 data");
    expect(r.output).not.toContain("migrate resolve");
    expect(await tables(db)).toEqual(before);
    expect(before).not.toContain("_prisma_migrations");
    const [{ role }] = await db.$queryRaw<{ role: string }[]>`SELECT role FROM "User" WHERE id = 'v1user'`;
    expect(role).toBe("CUSTOMER");
  }, 60_000);

  it("anything but exactly ALLOW_V1_CONVERSION=true is refused", async () => {
    const { url } = await v1Database();
    for (const value of ["1", "yes", "TRUE"]) {
      expect(deployStart({ DATABASE_URL: url, ALLOW_V1_CONVERSION: value }).status).not.toBe(0);
    }
  }, 60_000);

  it("converts it when ALLOW_V1_CONVERSION=true, then starts normally without the flag", async () => {
    const { url, db } = await v1Database();
    const r = deployStart({ DATABASE_URL: url, ALLOW_V1_CONVERSION: "true" });
    expect(r.status, r.output).toBe(0);
    expect(r.output).toContain("marking 0000_baseline");
    expect((await counts(db)).migrations).toBe(2);
    expect(await db.user.findUnique({ where: { id: "v1user" } })).not.toBeNull();
    const restart = deployStart({ DATABASE_URL: url });
    expect(restart.status, restart.output).toBe(0);
  }, 120_000);

  it("does not mistake an empty database left by a failed first V2 attempt for V1", async () => {
    const { url, db } = freshDatabase();
    execSync(`psql "${url}" -X -q -v ON_ERROR_STOP=1 -f prisma/migrations/0000_baseline/migration.sql`, { cwd: ROOT, stdio: "ignore" });
    expect(run("npx prisma migrate resolve --applied 0000_baseline", { DATABASE_URL: url }).status).toBe(0);
    const r = deployStart({ DATABASE_URL: url, SEED_ON_EMPTY: "catalogue-and-admin", ...ADMIN });
    expect(r.status, r.output).toBe(0);
    expect(await counts(db)).toMatchObject({ users: 1, demoUsers: 0, migrations: 2 });
  }, 120_000);
});
