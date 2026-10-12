import { expect, type Browser, type Page } from "@playwright/test";

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "demo-password";
export const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@ntoma.example", password: process.env.ADMIN_PASSWORD ?? "local-admin-password" };

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function newUser(browser: Browser, name = "E2E Customer") {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const page = await context.newPage();
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Phone/).fill("024 555 0101");
  await page.getByLabel("City").selectOption("Accra");
  await page.getByLabel("Password").fill("e2e-password-1");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/account/);
  return { page, email };
}

/** No horizontal scrolling at phone width. */
export async function expectNoOverflow(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `page is ${scroll}px wide on a ${inner}px screen`).toBeLessThanOrEqual(inner + 1);
}

/** Two-tap confirm buttons: tap, then tap the armed button. */
export async function confirmClick(page: Page, name: string | RegExp) {
  await page.getByRole("button", { name }).first().click();
  await page.getByRole("button", { name: /tap again|accept for|confirm/i }).first().click();
}
