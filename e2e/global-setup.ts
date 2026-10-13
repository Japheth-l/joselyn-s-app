import { execSync } from "child_process";

// Start every end-to-end run from a clean, seeded LOCAL database (the one the running app uses), so
// results don't depend on earlier runs (stock reserved, login rate limits, …). Set E2E_RESET=false to skip.
export default function globalSetup() {
  if (process.env.E2E_RESET === "false") return;
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://postgres@localhost:5433/ntoma_dev";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("E2E reset only runs against a local database.");
  const env = { ...process.env, DATABASE_URL: url };
  execSync(`sh scripts/reset-local-db.sh ${url}`, { stdio: "inherit" });
  execSync("npx prisma migrate deploy", { stdio: "ignore", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}
