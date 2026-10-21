import fs from "node:fs";
import path from "node:path";
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

  test("モバイルメニューに 5 つのセクション(Explore / Learn / About / Sister Sites / Display)が表示される", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    const titles = page.locator(".mobile-menu-section-title");
    await expect(titles).toHaveCount(5);
    await expect(titles.nth(0)).toContainText("Explore");
    await expect(titles.nth(1)).toContainText("Learn");
    await expect(titles.nth(2)).toContainText("About");
    await expect(titles.nth(3)).toContainText("Sister Sites");
    await expect(titles.nth(4)).toContainText("Display");
  });

  test("モバイルメニューを開くと検索 input にフォーカスが移る", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    await page.waitForTimeout(120);
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    expect(focusedId).toBe("mobile-menu-search-input");
  });

  test("検索 input から submit すると /search/?q= に遷移する", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.locator("#menu-toggle").click();
    const input = page.locator("#mobile-menu-search-input");
    await input.fill("メタ認知");
    await input.press("Enter");
    await page.waitForURL(/\/search\/\?q=/);
    expect(page.url()).toContain("/search/");
    expect(page.url()).toContain("q=%E3%83%A1%E3%82%BF%E8%AA%8D%E7%9F%A5");
  });

  test("ヘッダーが sticky で表示される", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header.site-header");
    await expect(header).toBeVisible();
    const position = await header.evaluate(
      (el) => getComputedStyle(el).position
    );
    expect(position).toBe("sticky");
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(100);
    const headerBox = await header.boundingBox();
    expect(headerBox?.y ?? 999).toBeLessThanOrEqual(0.5);
  });

  test("ページ上部へ戻るボタンが 600px スクロール後に表示される", async ({
    page,
  }) => {
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
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );
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

// ページは `/x/` で配信され、スラッシュ無しは 307 で転送される。ビルド後の書き換え
// (`src/plugins/trailing-slash-links.mjs`。ADR 0043)が登録から外れても描画は変わらないので、
// dist の全 HTML を fs で走査し、実在するページをスラッシュ無しで指す内部リンクが無いことを見る。
// フォームの action はプラグインの対象外でソース側で直しているので、href と併せて見る。
// JSON-LD の中の URL(自サイトの絶対 URL と、FAQ の回答文に入る href)はプラグインの対象外で
// ソース側で直しているので、ここで併せて見る。判定はプラグインの関数を使わずにここで書く
test("内部リンクがページをスラッシュ付きで指す", () => {
  const distRoot = path.resolve(process.cwd(), "dist");
  const files = fs
    .readdirSync(distRoot, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".html"))
    .map((e) => path.join(e.parentPath, e.name));
  expect(files.length, "dist に HTML が無い").toBeGreaterThan(200);
  const pages = new Set(
    files
      .filter((f) => path.basename(f) === "index.html")
      .map(
        (f) =>
          "/" +
          path.relative(distRoot, path.dirname(f)).split(path.sep).join("/")
      )
  );
  const offenders: string[] = [];
  const check = (where: string, p: string) => {
    if (p.endsWith("/")) return;
    let decoded = p;
    try {
      decoded = decodeURIComponent(p);
    } catch {
      // decode できない href はページを指さないので数えない
    }
    if (pages.has(decoded)) offenders.push(`${where}: ${p}`);
  };
  const hrefRe = /\s(?:href|action)="(\/(?!\/)[^"?#]*)/g;
  const strings = (v: unknown): string[] =>
    typeof v === "string"
      ? [v]
      : v !== null && typeof v === "object"
        ? Object.values(v).flatMap(strings)
        : [];
  for (const file of files) {
    const where = path.relative(distRoot, file);
    const html = fs.readFileSync(file, "utf8");
    for (const m of html.matchAll(hrefRe)) check(where, m[1]);
    for (const block of html.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
    )) {
      for (const v of strings(JSON.parse(block[1]))) {
        if (v.startsWith("https://edu-evidence.org/"))
          check(`${where} JSON-LD`, new URL(v).pathname);
        for (const m of v.matchAll(hrefRe)) check(`${where} JSON-LD`, m[1]);
      }
    }
  }
  expect(offenders.slice(0, 20), `${offenders.length} 件`).toEqual([]);
});
