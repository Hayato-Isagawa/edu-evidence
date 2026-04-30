import { test, expect } from "@playwright/test";

test.describe("目次 (TOC)", () => {
  test("長文ページに sidebar / mobile 両 variant の TOC が描画される", async ({ page }) => {
    await page.goto("/strategies/feedback/");
    await expect(page.locator('[data-toc][data-toc-variant="sidebar"]')).toHaveCount(1);
    await expect(page.locator('[data-toc][data-toc-variant="mobile"]')).toHaveCount(1);
    const links = page.locator("[data-toc-link]");
    expect(await links.count()).toBeGreaterThan(0);
  });

  test("短文ページには TOC が描画されない", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("[data-toc]")).toHaveCount(0);
  });

  test("スクロールに応じて aria-current が現在セクションに追従する", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/strategies/feedback/");
    const sidebar = page.locator('[data-toc-variant="sidebar"]');
    await expect(sidebar).toBeVisible();
    const firstHeading = page.locator("article h2[id]").first();
    await firstHeading.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -50));
    await page.waitForFunction(() => {
      return document.querySelectorAll('[data-toc-link][aria-current="location"]').length > 0;
    });
    const current = sidebar.locator('[data-toc-link][aria-current="location"]');
    expect(await current.count()).toBeGreaterThan(0);
  });

  test("モバイル TOC details の開閉で data-state が連動する", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/strategies/feedback/");
    const mobileToc = page.locator('[data-toc-variant="mobile"]');
    await expect(mobileToc).toHaveAttribute("data-state", "closed");
    await mobileToc.locator("summary").click();
    await expect(mobileToc).toHaveAttribute("data-state", "open");
    await mobileToc.locator("summary").click();
    await expect(mobileToc).toHaveAttribute("data-state", "closed");
  });
});
