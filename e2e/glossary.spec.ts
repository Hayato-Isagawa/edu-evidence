import { test, expect } from "@playwright/test";
import { glossary } from "../src/data/glossary";

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

test.describe("用語集ページ構造", () => {
  test("カテゴリ見出しが 6 つ表示される", async ({ page }) => {
    await page.goto("/guide/glossary");
    const headings = page.locator("h2[id^='cat-']");
    await expect(headings).toHaveCount(6);
  });

  test("総エントリ数が glossary.length と一致する", async ({ page }) => {
    await page.goto("/guide/glossary");
    await expect(page.locator(`text=${glossary.length}語収録`)).toBeVisible();
  });

  test("神経神話エントリが critical_thinking カテゴリ配下に表示される", async ({ page }) => {
    await page.goto("/guide/glossary");
    const section = page.locator('section[aria-labelledby="cat-critical_thinking"]');
    await expect(section.getByText("神経神話")).toBeVisible();
  });
});
