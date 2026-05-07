import { test, expect } from "@playwright/test";

test.describe("戦略ページの culturalContext 太字描画", () => {
  test("blocked-vs-interleaved で <strong> として描画される", async ({ page }) => {
    await page.goto("/strategies/blocked-vs-interleaved/");
    const strong = page.locator("strong", { hasText: "望ましい難しさ" });
    await expect(strong).toBeVisible();
  });

  test("culturalContext 周辺に literal の ** が残らない", async ({ page }) => {
    await page.goto("/strategies/blocked-vs-interleaved/");
    const body = await page.locator("main").textContent();
    expect(body).not.toContain("**望ましい難しさ");
    expect(body).not.toContain("**見かけの成績");
  });
});
