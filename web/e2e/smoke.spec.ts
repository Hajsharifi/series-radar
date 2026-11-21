import { test, expect } from "@playwright/test";

test("radar page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/.+/);
  await page.waitForTimeout(2000);
  const body = await page.textContent("body");
  expect(body && body.length).toBeGreaterThan(100);
});

test("search page opens", async ({ page }) => {
  await page.goto("/#/search");
  await page.waitForTimeout(2000);
  const body = await page.textContent("body");
  expect(body && body.length).toBeGreaterThan(100);
});
