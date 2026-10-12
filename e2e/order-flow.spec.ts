import { expect, test } from "@playwright/test";
import { confirmClick, DEMO_PASSWORD, expectNoOverflow, login, newUser } from "./helpers";

// Scenario 4 end to end in the browser, on a phone-sized screen, with sandbox payments:
// request → quote → accept → deposit → production → pickup → balance → handover code → completion → review.
test("customer completes a custom order with a demo tailor", async ({ browser }) => {
  const { page: customer } = await newUser(browser);

  // Order wizard
  await customer.goto("/order/new?style=kaba-and-slit");
  await expectNoOverflow(customer);
  await customer.getByLabel("Neckline").selectOption("V-neck");
  await customer.getByRole("button", { name: "Continue" }).click(); // details → fabric
  await customer.getByRole("button", { name: "Continue" }).click(); // fabric (tailor provides) → measurements
  for (const [key, value] of Object.entries({ chest: "38", underbust: "33", waist: "30", hips: "40", shoulder: "15", topLength: "24", trouserLength: "40", sleeve: "22" })) {
    const input = customer.locator(`input[name="m_${key}"]`);
    if (await input.count()) await input.fill(value);
  }
  await customer.getByRole("button", { name: "Continue" }).click(); // → budget
  await customer.getByLabel(/budget/i).fill("600");
  await customer.getByRole("button", { name: "Continue" }).click(); // → choose tailors
  const auntie = customer.locator("label", { hasText: "Auntie Ama's Stitches" });
  await expect(auntie).toBeVisible({ timeout: 15_000 });
  await expect(auntie).toContainText("km from you");
  await auntie.locator('input[type="checkbox"]').check();
  await expectNoOverflow(customer);
  await customer.getByRole("button", { name: "Continue" }).click(); // → review
  await customer.getByRole("button", { name: "Send quote requests" }).click();
  await expect(customer).toHaveURL(/\/orders\/[a-z0-9]+\?created=1/);
  const orderUrl = customer.url().split("?")[0];
  const orderId = orderUrl.split("/").pop()!;
  await expect(customer.getByText("Waiting for quotes").first()).toBeVisible();

  // Business quotes
  const bizContext = await browser.newContext({ viewport: { width: 360, height: 740 } });
  const biz = await bizContext.newPage();
  await login(biz, "business1@demo.ntoma.example", DEMO_PASSWORD);
  await biz.goto("/biz");
  await biz.getByRole("link", { name: /Auntie Ama/ }).first().click();
  await biz.waitForURL(/\/biz\/[a-z0-9]+(\?.*)?$/);
  const bizBase = biz.url().replace(/\/$/, "").split("?")[0];
  await biz.goto(`${bizBase}/orders/${orderId}`);
  await expectNoOverflow(biz);
  await expect(biz.getByText(/budget/i)).toHaveCount(0); // the customer's budget is private
  await biz.locator('input[name="labour"]').fill("180");
  // Pick the fabric with the most free stock (earlier runs against the same database reserve some).
  const options = await biz.locator('select[name="fabricListingId"] option:not([disabled])').evaluateAll((els) =>
    els.map((e) => ({ value: (e as HTMLOptionElement).value, free: Number(/([\d.]+) \w+ free/.exec(e.textContent ?? "")?.[1] ?? 0) })));
  const best = options.sort((a, b) => b.free - a.free)[0];
  test.skip(!best || best.free < 6, "Demo fabric stock used up; reseed the database (npm run db:seed on a fresh database).");
  await biz.locator('select[name="fabricListingId"]').selectOption(best.value);
  await biz.locator('input[name="fabricQty"]').fill("6");
  const done = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await biz.locator('input[name="completionDate"]').fill(done);
  await biz.getByRole("button", { name: "Send quote" }).click();
  await expect(biz.getByText("Quote received").first()).toBeVisible();

  // Customer accepts and pays the deposit (sandbox)
  await customer.goto(orderUrl);
  await confirmClick(customer, "Accept this quote");
  await expect(customer.getByText("Waiting for payment").first()).toBeVisible();
  await customer.getByRole("button", { name: /Pay deposit/ }).click();
  await expect(customer).toHaveURL(/\/pay\/sandbox/);
  await expect(customer.getByText("Sandbox checkout: no real money")).toBeVisible();
  await customer.getByRole("button", { name: "Approve test payment" }).click();
  await expect(customer).toHaveURL(/payment=success/);
  await expect(customer.getByText("Measurements confirmed").first()).toBeVisible();

  // Business makes it
  for (const step of ["IN_PRODUCTION", "QUALITY_CHECK", "READY"]) {
    await biz.goto(`${bizBase}/orders/${orderId}`);
    await biz.locator(`form:has(input[name="to"][value="${step}"]) button[type="submit"]`).click();
    await expect(biz.locator(`form:has(input[name="to"][value="${step}"])`)).toHaveCount(0);
  }

  // Customer chooses pickup, pays the balance and gets the code
  await customer.goto(orderUrl);
  await customer.getByRole("button", { name: "Save choice" }).click();
  await expect(customer.getByText(/collect it/i).first()).toBeVisible();
  await customer.goto(orderUrl);
  await customer.getByRole("button", { name: /balance/ }).click();
  await customer.getByRole("button", { name: "Approve test payment" }).click();
  await expect(customer).toHaveURL(/payment=success/);
  await customer.getByRole("button", { name: "Show my pickup code" }).click();
  const message = await customer.getByRole("status").filter({ hasText: "pickup code is" }).innerText();
  const code = message.match(/(\d{6})/)![1];

  // Wrong code is refused, right code hands over
  await biz.goto(`${bizBase}/orders/${orderId}`);
  await biz.getByLabel(/pickup code/i).fill(code === "000000" ? "111111" : "000000");
  await biz.getByRole("button", { name: "Confirm handover" }).click();
  await expect(biz.getByRole("alert").filter({ hasText: /doesn't match/ })).toBeVisible();
  await biz.getByLabel(/pickup code/i).fill(code);
  await biz.getByRole("button", { name: "Confirm handover" }).click();
  await expect(biz.getByText("Collected").first()).toBeVisible();

  // Customer confirms and reviews
  await customer.goto(orderUrl);
  await confirmClick(customer, "Yes, all good");
  await expect(customer.getByText("Completed").first()).toBeVisible();
  await customer.getByLabel("5★").check();
  await customer.getByLabel("Comment").fill("Lovely fit (end-to-end test).");
  await customer.getByRole("button", { name: "Post review" }).click();
  await expect(customer.getByText(/You rated this order 5★/)).toBeVisible();
  await expectNoOverflow(customer);
});
