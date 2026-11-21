import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

for (const path of ["/", "/#/favorites", "/#/calendar", "/#/search"]) {
  test(`no serious a11y violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForTimeout(2000);
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    if (serious.length) console.log(path, JSON.stringify(serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }))));
    expect(serious).toHaveLength(0);
  });
}
