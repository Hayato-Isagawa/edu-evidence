import { test, expect } from "@playwright/test";

test.describe("用語ツールチップ", () => {
  test("glossary-tip が本文中に存在する", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    const tips = page.locator(".glossary-tip");
    await expect(tips.first()).toBeVisible();
  });

  test("ホバーでツールチップが表示される", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    const tip = page.locator(".glossary-tip").first();
    await tip.hover();
    await page.waitForTimeout(200);
    const bubble = page.locator(".glossary-bubble.is-visible");
    await expect(bubble).toBeVisible();
  });

  test("ツールチップに data-tip の内容が表示される", async ({ page }) => {
    await page.goto("/strategies/feedback/");
    const tip = page.locator(".glossary-tip").first();
    const expectedText = await tip.getAttribute("data-tip");
    await tip.hover();
    await page.waitForTimeout(200);
    const bubble = page.locator(".glossary-bubble.is-visible");
    await expect(bubble).toContainText(expectedText!);
  });
});

test.describe("用語集", () => {
  test("アンカーリンクが機能する", async ({ page }) => {
    await page.goto("/guide/glossary#RCT");
    const rctEntry = page.locator("#RCT");
    await expect(rctEntry).toBeVisible();
  });
});
