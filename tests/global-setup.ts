import { execSync } from "child_process";

// Recreates the local test database and applies every migration, exactly as production would.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:5433/ntoma_test";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Tests only run against a local database.");
  execSync(`sh scripts/reset-local-db.sh ${url}`, { stdio: "inherit" });
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
