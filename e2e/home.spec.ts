import { test, expect } from "@playwright/test";

test.describe("トップページ", () => {
  test("タイトルが正しい", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/EduEvidence JP/);
  });

  test("FV の見出しが表示される", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toContainText("エビデンス");
  });

  test("戦略一覧が 70 件以上ある", async ({ page }) => {
    await page.goto("/");
    const rows = page.locator("#strategy-list > a");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(70);
  });

  test("EEF 説明セクションが存在する", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText("Education Endowment Foundation")
    ).toBeVisible();
  });

  test("source バッジが複数表示される戦略がある", async ({ page }) => {
    await page.goto("/");
    // 少なくとも 1 つの戦略行に 2 つ以上のバッジがあること
    const rows = page.locator("#strategy-list > a");
    const count = await rows.count();
    let found = false;
    for (let i = 0; i < Math.min(count, 30); i++) {
      const badges = rows.nth(i).locator(".rounded-full");
      if ((await badges.count()) >= 2) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("各戦略行に効果量バーが描画される", async ({ page }) => {
    await page.goto("/");
    const rows = page.locator("#strategy-list > a");
    const rowCount = await rows.count();
    const bars = page.locator("[data-effect-bar]");
    expect(await bars.count()).toBe(rowCount);
    const firstSign = await bars.first().getAttribute("data-effect-sign");
    expect(["positive", "negative", "neutral"]).toContain(firstSign);
  });

  test("負の効果量を持つ戦略のバーは negative として描画される", async ({ page }) => {
    await page.goto("/");
    const rows = page.locator('#strategy-list > a[data-months]');
    const count = await rows.count();
    let foundNegative = false;
    for (let i = 0; i < count; i++) {
      const months = Number(await rows.nth(i).getAttribute("data-months"));
      if (months < 0) {
        const sign = await rows.nth(i).locator("[data-effect-bar]").getAttribute("data-effect-sign");
        expect(sign).toBe("negative");
        foundNegative = true;
        break;
      }
    }
    expect(foundNegative).toBe(true);
  });
});
