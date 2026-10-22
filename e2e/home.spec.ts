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

  test("フッターの CC BY-SA 4.0 がライセンスの説明ページへ別タブでリンクしている", async ({
    page,
  }) => {
    await page.goto("/");
    const link = page
      .locator("footer")
      .getByRole("link", { name: "CC BY-SA 4.0" });
    await expect(link).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/deed.ja"
    );
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
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

  test("負の効果量を持つ戦略のバーは negative として描画される", async ({
    page,
  }) => {
    await page.goto("/");
    const rows = page.locator("#strategy-list > a[data-months]");
    const count = await rows.count();
    let foundNegative = false;
    for (let i = 0; i < count; i++) {
      const months = Number(await rows.nth(i).getAttribute("data-months"));
      if (months < 0) {
        const sign = await rows
          .nth(i)
          .locator("[data-effect-bar]")
          .getAttribute("data-effect-sign");
        expect(sign).toBe("negative");
        foundNegative = true;
        break;
      }
    }
    expect(foundNegative).toBe(true);
  });

  // 悩みカードは見出しだけをリンクにし、疑似要素でカード全体に当たり判定を広げている(ADR 0044)。
  // axe はこの構造を label-content-name-mismatch の対象外として扱い、名前の一致を測らないので、
  // リンク名とクリック領域をここで直接見る。locator.click() は重なったリンクに遮られるので座標で見る
  test("悩みカード: リンク名は見出しの文字列だけで、カード全体がクリック領域になっている", async ({
    page,
  }) => {
    await page.goto("/");
    const cards = page.locator("[data-concern-card]");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const title = (await card.locator("h3").innerText()).trim();
      await expect(card.getByRole("link")).toHaveCount(1);
      await expect(
        card.getByRole("link", { name: title, exact: true })
      ).toHaveCount(1);
      await card.scrollIntoViewIfNeeded();
      // カテゴリ・説明文・件数の中心と、padding 内の左上・右下で、最前面がこのカードのリンクか
      const hits = await card.evaluate((el) => {
        const link = el.querySelector("a");
        const r = el.getBoundingClientRect();
        const center = (e: Element) => {
          const b = e.getBoundingClientRect();
          return [b.left + b.width / 2, b.top + b.height / 2];
        };
        const points = [
          center(el.firstElementChild!),
          center(el.querySelector("p")!),
          center(el.lastElementChild!),
          [r.left + 8, r.top + 8],
          [r.right - 8, r.bottom - 8],
        ];
        return points.map(
          ([x, y]) => document.elementFromPoint(x, y)?.closest("a") === link
        );
      });
      expect(hits, `カード ${i + 1}「${title}」`).toEqual([
        true,
        true,
        true,
        true,
        true,
      ]);
    }
    const first = cards.first();
    const href = await first.getByRole("link").getAttribute("href");
    const expected = new URL(href!, page.url());
    await first.scrollIntoViewIfNeeded();
    const box = await first.locator("p").boundingBox();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.waitForURL(
      (url) => url.pathname === expected.pathname && url.hash === expected.hash
    );
  });
});
