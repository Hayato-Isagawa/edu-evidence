import { test, expect } from "@playwright/test";

test.describe("戦略詳細ページ", () => {
  test("メタ認知ページが表示される", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    await expect(page.locator("h1")).toContainText("メタ認知");
  });

  test("出典別エビデンスセクションが表示される", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    await expect(page.getByText("出典別のエビデンス")).toBeVisible();
  });

  test("culturalContext が表示される", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    await expect(
      page.getByText("日本の文脈で考慮したいこと")
    ).toBeVisible();
  });
});
