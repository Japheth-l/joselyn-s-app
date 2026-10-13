import { existsSync } from "fs";
import { defineConfig } from "@playwright/test";

const chromium = process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export default defineConfig({
  testDir: ".",
  testMatch: "login-check.spec.ts",
  timeout: 60_000,
  workers: 1,
  reporter: "list",
  use: { launchOptions: existsSync(chromium) ? { executablePath: chromium } : {} },
});
