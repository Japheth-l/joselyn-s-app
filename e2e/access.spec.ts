import { expect, test } from "@playwright/test";
import { newUser } from "./helpers";

test("signed-out visitors are sent to log in", async ({ page }) => {
  for (const path of ["/orders", "/account", "/admin", "/biz", "/pro", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  }
});

test("customers can't open admin pages, other people's orders, or private files", async ({ browser }) => {
  const { page } = await newUser(browser, "Curious Customer");
  for (const path of ["/admin", "/admin/users", "/admin/finance", "/orders/does-not-exist", "/files/does-not-exist", "/pro/deliveries/does-not-exist", "/biz/does-not-exist"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(404);
  }
});

test("security headers are sent", async ({ request }) => {
  const res = await request.get("/");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["strict-transport-security"]).toContain("max-age");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});

test("cron endpoint refuses requests without the secret", async ({ request }) => {
  const res = await request.post("/api/cron");
  expect([401, 503]).toContain(res.status());
});
