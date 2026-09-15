import { test, expect } from "@playwright/test";

/**
 * 印刷(研修資料としての持ち出し)。global.css の @media print ブロックが効いていることを見る。
 * ダークで印刷した場合を見る — 配色の戻し忘れはライトでは検出できない。
 * 指導法ページとコラムで代表する(構造が違う: 出典コピーの帰属文・グラフの有無)。
 */

const pages = [
  "/strategies/metacognition/",
  "/columns/class-size-cost-effectiveness/",
];

test.describe("印刷スタイル", () => {
  test.use({ colorScheme: "dark" });

  for (const path of pages) {
    test(`${path} はナビを省き、配布用の体裁になる`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
      // 出典コピーのボタンは hidden 属性で始まり JS が外す。print で消えたことを
      // 見る前に、画面では出ていることを確かめる(JS が止まっていても通る空振りを防ぐ)
      await expect(page.locator("#citation-copy")).toBeVisible();
      await page.emulateMedia({ media: "print" });

      // 画面用の chrome は消える
      await expect(page.locator("#back-to-top")).toBeHidden();
      await expect(page.getByLabel("メインナビゲーション")).toBeHidden();
      await expect(page.locator("#menu-toggle")).toBeHidden();
      await expect(page.locator("#mobile-menu")).toBeHidden();
      await expect(page.locator(".toc")).toHaveCount(2);
      await expect(page.locator(".toc").first()).toBeHidden();
      await expect(page.locator(".toc").last()).toBeHidden();
      await expect(page.locator("#citation-copy")).toBeHidden();
      await expect(
        page.locator('body > footer section[aria-labelledby="footer-explore"]')
      ).toBeHidden();
      // 出所・出典表記・ライセンス表示は残る。toContainText は textContent を読むので
      // display:none でも通ってしまう — 描画されていることを見る
      await expect(
        page.locator(".site-header").getByText("EduEvidence")
      ).toBeVisible();
      await expect(page.locator("#citation-text")).toBeVisible();
      const footer = page.locator("body > footer");
      await expect(footer.getByText("info@edu-evidence.org")).toBeVisible();
      await expect(footer.getByText("CC BY-SA 4.0")).toBeVisible();
      await expect(footer.getByText("©")).toBeVisible();

      // sticky を解き、配色をライトへ戻す(data-theme は dark のまま)
      const computed = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        return {
          headerPosition: getComputedStyle(
            document.querySelector(".site-header")!
          ).position,
          htmlBackground: root.backgroundColor,
          accent: root.getPropertyValue("--color-accent").trim(),
        };
      });
      expect(computed.headerPosition).toBe("static");
      expect(computed.htmlBackground).toBe("rgb(255, 255, 255)");
      expect(computed.accent).toBe("#2b5d3a");

      // 外部リンクは URL を併記する
      const external = page.locator('main a[target="_blank"]').first();
      const href = await external.getAttribute("href");
      expect(href).toMatch(/^https?:\/\//);
      const after = await external.evaluate(
        (el) => getComputedStyle(el, "::after").content
      );
      expect(after).toContain(href!);
    });

    test(`${path} は 320px でも横に溢れない`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      await page.emulateMedia({ media: "print" });
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    });
  }

  test("本文リンクは黒の下線になる", async ({ page }) => {
    await page.goto(pages[0]);
    await page.emulateMedia({ media: "print" });
    // .link-underline は色に transition があり、切り替え直後は途中の色を返す
    await page.addStyleTag({
      content: "*{transition:none!important;animation:none!important}",
    });
    const link = page.locator(".prose-article a:not(.glossary-tip)").first();
    await expect(link).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(link).toHaveCSS("text-decoration-line", "underline");
  });
});
