import { existsSync } from "fs";
import { defineConfig, devices } from "@playwright/test";

// Use a pre-installed Chromium when the bundled one is missing (e.g. CI images with a different version).
const chromium = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const launchOptions = existsSync(chromium) ? { executablePath: chromium } : {};

// End-to-end tests run against a built app on a seeded local database:
//   npm run build && PAYMENTS_MODE=sandbox npm start   (database seeded with `npm run db:seed`)
//   npm run test:e2e
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions,
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 5"], viewport: { width: 360, height: 740 } } },
  ],
});
