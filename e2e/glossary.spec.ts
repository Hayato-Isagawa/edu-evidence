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
    const bubble = page.locator('.glossary-bubble[data-state="visible"]');
    await expect(bubble).toBeVisible();
  });

  test("ツールチップに data-tip の内容が表示される", async ({ page }) => {
    await page.goto("/strategies/feedback/");
    const tip = page.locator(".glossary-tip").first();
    const expectedText = await tip.getAttribute("data-tip");
    await tip.hover();
    await page.waitForTimeout(200);
    const bubble = page.locator('.glossary-bubble[data-state="visible"]');
    await expect(bubble).toContainText(expectedText!);
  });
});

test.describe("用語ツールチップ(タッチ)", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("1 回目のタップで説明が出て、2 回目で用語集へ移る", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    const tip = page.locator(".glossary-tip").first();
    const bubble = page.locator(".glossary-bubble");
    await tip.scrollIntoViewIfNeeded();
    await tip.tap();
    await expect(bubble).toHaveAttribute("data-state", "visible");
    await page.waitForTimeout(500);
    expect(page.url()).toContain("/strategies/metacognition/");
    await tip.tap();
    await page.waitForURL(/\/guide\/glossary\//);
  });

  test("ほかの場所をタップすると消える", async ({ page }) => {
    // Safari はタップしたリンクに焦点が移らず、focusout では消えない。同じ状態にして見る
    await page.addInitScript(() =>
      document.addEventListener("mousedown", (e) => e.preventDefault(), true)
    );
    await page.goto("/strategies/metacognition/");
    const tip = page.locator(".glossary-tip").first();
    const bubble = page.locator(".glossary-bubble");
    await tip.scrollIntoViewIfNeeded();
    await tip.tap();
    await expect(bubble).toHaveAttribute("data-state", "visible");
    // 左の余白(リンクの無い場所)
    await page.touchscreen.tap(4, 400);
    await expect(bubble).toHaveAttribute("data-state", "hidden");
    expect(page.url()).toContain("/strategies/metacognition/");
  });
});

test.describe("用語ツールチップ(キーボード)", () => {
  test("フォーカスで説明が出て、Esc で消え、Enter で用語集へ移る", async ({
    page,
  }) => {
    await page.goto("/strategies/metacognition/");
    const tip = page.locator(".glossary-tip").first();
    const bubble = page.locator(".glossary-bubble");
    await tip.scrollIntoViewIfNeeded();
    // :focus-visible になるよう、キーボードで直前から移る
    await page.keyboard.press("Tab");
    await tip.focus();
    await expect(bubble).toHaveAttribute("data-state", "visible");
    await expect(tip).toHaveAttribute(
      "aria-describedby",
      (await bubble.getAttribute("id")) ?? "no-id"
    );
    await page.keyboard.press("Escape");
    await expect(bubble).toHaveAttribute("data-state", "hidden");
    await expect(tip).not.toHaveAttribute("aria-describedby");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/guide\/glossary\//);
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

  test("神経神話エントリが critical_thinking カテゴリ配下に表示される", async ({
    page,
  }) => {
    await page.goto("/guide/glossary");
    const section = page.locator(
      'section[aria-labelledby="cat-critical_thinking"]'
    );
    await expect(section.locator("[id='神経神話']")).toBeVisible();
  });
});
