import { test, expect } from "@playwright/test";

test.describe("ナビゲーション", () => {
  test("モバイルメニューが開閉する", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const toggle = page.locator("#menu-toggle");
    await expect(toggle).toBeVisible();
    await toggle.click();
    const menu = page.locator("#mobile-menu");
    await expect(menu).not.toHaveAttribute("inert");
    await expect(menu).toHaveAttribute("data-state", "open");
    await expect(menu).toHaveAttribute("role", "dialog");
    await expect(menu).toHaveAttribute("aria-modal", "true");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("body")).toHaveAttribute("data-menu", "open");
    await toggle.click();
    await expect(menu).toHaveAttribute("inert", "");
    await expect(menu).toHaveAttribute("data-state", "closed");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("body")).toHaveAttribute("data-menu", "closed");
  });

  test("モバイルメニューに 4 つのセクション(Explore / Learn / About / Display)が表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    const titles = page.locator(".mobile-menu-section-title");
    await expect(titles).toHaveCount(4);
    await expect(titles.nth(0)).toContainText("Explore");
    await expect(titles.nth(1)).toContainText("Learn");
    await expect(titles.nth(2)).toContainText("About");
    await expect(titles.nth(3)).toContainText("Display");
  });

  test("モバイルメニューを開くと検索 input にフォーカスが移る", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    await page.waitForTimeout(120);
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe("mobile-menu-search-input");
  });

  test("検索 input から submit すると /search?q= に遷移する", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    const input = page.locator("#mobile-menu-search-input");
    await input.fill("メタ認知");
    await input.press("Enter");
    await page.waitForURL(/\/search\?q=/);
    expect(page.url()).toContain("/search");
    expect(page.url()).toContain("q=%E3%83%A1%E3%82%BF%E8%AA%8D%E7%9F%A5");
  });

  test("ヘッダーが sticky で表示される", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header.site-header");
    await expect(header).toBeVisible();
    const position = await header.evaluate((el) => getComputedStyle(el).position);
    expect(position).toBe("sticky");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(100);
    const headerBox = await header.boundingBox();
    expect(headerBox?.y ?? 999).toBeLessThanOrEqual(0.5);
  });

  test("ページ上部へ戻るボタンが 600px スクロール後に表示される", async ({ page }) => {
    await page.goto("/strategies/feedback/");
    const btn = page.locator("#back-to-top");
    await expect(btn).toHaveAttribute("data-state", "hidden");
    await expect(btn).toHaveAttribute("aria-hidden", "true");
    await page.evaluate(() => window.scrollTo(0, 800));
    await expect(btn).toHaveAttribute("data-state", "visible");
    await expect(btn).toHaveAttribute("aria-hidden", "false");
    await btn.click();
    await page.waitForFunction(() => window.scrollY < 10);
    await expect(btn).toHaveAttribute("data-state", "hidden");
  });

  test("長文ページに読了プログレスバーが表示される", async ({ page }) => {
    await page.goto("/strategies/feedback/");
    const bar = page.locator("#reading-progress");
    await expect(bar).toHaveAttribute("role", "progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", "0");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForFunction(() => {
      const el = document.getElementById("reading-progress");
      return el && Number(el.getAttribute("aria-valuenow")) >= 90;
    });
    const finalValue = await bar.getAttribute("aria-valuenow");
    expect(Number(finalValue)).toBeGreaterThanOrEqual(90);
  });

  test("短文ページにはプログレスバーが表示されない", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#reading-progress")).toHaveCount(0);
  });
});
