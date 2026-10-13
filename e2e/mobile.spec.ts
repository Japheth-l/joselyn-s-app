import { expect, test } from "@playwright/test";
import { ADMIN, DEMO_PASSWORD, expectNoOverflow, login } from "./helpers";

// Scenario 15: main screens fit a 360 px phone without horizontal scrolling.
const PUBLIC = ["/", "/styles", "/styles/kaba-and-slit", "/fabrics", "/tailors", "/tailors/demo-kwame-bespoke", "/login", "/signup", "/policies/terms", "/policies/refunds"];

test("public pages", async ({ page }) => {
  for (const path of PUBLIC) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoOverflow(page);
  }
});

test("customer pages", async ({ page }) => {
  await login(page, "customer@demo.ntoma.example", DEMO_PASSWORD);
  for (const path of ["/account", "/orders", "/order/new", "/measurements", "/notifications", "/support", "/settings"]) {
    await page.goto(path);
    await expectNoOverflow(page);
  }
});

test("business portal pages", async ({ page }) => {
  await login(page, "business1@demo.ntoma.example", DEMO_PASSWORD);
  await page.goto("/biz");
  await page.getByRole("link", { name: /Auntie Ama/ }).first().click();
  await page.waitForURL(/\/biz\/[a-z0-9]+(\?.*)?$/);
  const base = page.url().split("?")[0];
  for (const sub of ["", "/orders", "/inventory", "/styles", "/appointments", "/reviews", "/finance", "/team", "/profile", "/verification"]) {
    const res = await page.goto(base + sub);
    expect(res?.status(), sub).toBe(200);
    await expectNoOverflow(page);
  }
});

test("professional pages", async ({ page }) => {
  await login(page, "rider@demo.ntoma.example", DEMO_PASSWORD);
  for (const path of ["/pro", "/pro/deliveries", "/pro/earnings"]) {
    await page.goto(path);
    await expectNoOverflow(page);
  }
});

test("admin pages", async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  for (const path of ["/admin", "/admin/verifications", "/admin/users", "/admin/orders", "/admin/disputes", "/admin/reviews", "/admin/support", "/admin/finance", "/admin/catalogue", "/admin/settings", "/admin/audit"]) {
    await page.goto(path);
    await expectNoOverflow(page);
  }
});
