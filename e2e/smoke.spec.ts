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
});

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

test.describe("用語集", () => {
  test("アンカーリンクが機能する", async ({ page }) => {
    await page.goto("/guide/glossary#RCT");
    const rctEntry = page.locator("#RCT");
    await expect(rctEntry).toBeVisible();
  });
});

test.describe("検索", () => {
  test("検索ページが表示される", async ({ page }) => {
    await page.goto("/search/");
    await expect(page.locator("h1")).toContainText("検索");
    await expect(page.locator("#search")).toBeVisible();
  });
});

test.describe("404", () => {
  test("存在しないページで 404 が表示される", async ({ page }) => {
    await page.goto("/this-page-does-not-exist/");
    await expect(page.locator("h1")).toContainText("404");
  });
});

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
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("body")).toHaveAttribute("data-menu", "open");
    await toggle.click();
    await expect(menu).toHaveAttribute("inert", "");
    await expect(menu).toHaveAttribute("data-state", "closed");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("body")).toHaveAttribute("data-menu", "closed");
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
