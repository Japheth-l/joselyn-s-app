import { expect, test } from "@playwright/test";

// Logs in to a running app (V1 or V2) with existing credentials and opens a page that reads that user's data.
//   CHECK_BASE_URL=http://localhost:3101 CHECK_USERS="you@example.com:/orders" CHECK_PASSWORD=… \
//     npx playwright test -c scripts/rehearsal/playwright.config.ts
// CHECK_USERS is a comma-separated list of email:path pairs that share CHECK_PASSWORD. Emails are masked in output.
const BASE = process.env.CHECK_BASE_URL ?? "";
const USERS = (process.env.CHECK_USERS ?? "").split(",").filter(Boolean);
const mask = (email: string) => email.replace(/^(.).*@/, "$1…@");

test.skip(!BASE || USERS.length === 0 || !process.env.CHECK_PASSWORD, "set CHECK_BASE_URL, CHECK_USERS and CHECK_PASSWORD");
for (const pair of USERS) {
  const [email, path] = pair.split(":");
  test(`login ${mask(email)} → ${path}`, async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(process.env.CHECK_PASSWORD!);
    await page.getByRole("button", { name: /log in/i }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    const res = await page.goto(`${BASE}${path}`);
    expect(res?.status()).toBe(200);
    console.log(`${mask(email)} ${path} -> ${res?.status()} | ${(await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 140)}`);
  });
}
