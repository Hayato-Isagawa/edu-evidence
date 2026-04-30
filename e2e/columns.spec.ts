import { test, expect } from "@playwright/test";

test.describe("コラム", () => {
  test("テーブルにスタイルが当たっている", async ({ page }) => {
    await page.goto("/columns/class-size-cost-effectiveness/");
    const table = page.locator(".prose-article table");
    await expect(table).toBeVisible();
    const thead = page.locator(".prose-article thead");
    const bg = await thead.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    // 背景色が transparent ではないこと(= スタイルが当たっている)
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });
});
