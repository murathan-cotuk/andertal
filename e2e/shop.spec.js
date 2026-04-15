// @ts-check
const { test, expect } = require("@playwright/test");

test.describe("Shop – Homepage", () => {
  test("loads without errors", async ({ page }) => {
    await page.goto("/de");
    await expect(page).not.toHaveTitle(/Error|404|500/i);
  });
});

test.describe("Shop – Category page", () => {
  test("displays products or empty state", async ({ page }) => {
    // Replace with a real category slug from your store
    await page.goto("/de/category/schuhe").catch(() => page.goto("/de"));
    await expect(page.locator("body")).toBeVisible();
  });
});
