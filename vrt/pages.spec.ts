import { test, expect } from "@playwright/test";

interface Target {
  name: string;
  path: string;
}

/**
 * `/changelog` は対象に含めない。
 *
 * 更新履歴は体感の変わる PR ごとに最大 1 件増え、`changelog.astro` の配列が
 * 新しい順なので先頭に入る(規約は `CONTRIBUTING.md` の
 * 「changelog を同じ PR で更新する」)。ページ全体を撮ると内容の追加だけで
 * 必ず差分が出て、本当の崩れが埋もれる(#428 で実際に起きた)。
 *
 * 安定させる方法を 2 つ試して、どちらも採らなかった:
 *   - 最古のエントリだけを撮る → 要素の Y 位置が変わるとサブピクセルの丸めで
 *     1px 背が伸び、それ自体が差分になった
 *   - 最下部のビューポートを撮る → 安定はするが、エントリの余白を py-10 から
 *     py-4 に変える大きな崩れを検出できなかった(既定の比較しきい値に対して
 *     変化が疎すぎる)
 *
 * 共通のヘッダー・フッター・FV は他の 15 ページが押さえている。このページに
 * 固有なのは日付・種別ラベル・リスト項目の描画で、面積は小さい。常に赤い検査や
 * 見逃す検査を置くより、対象外と明示するほうが正直だと判断した。
 */
const pages: Target[] = [
  { name: "home", path: "/" },
  { name: "columns-index", path: "/columns" },
  { name: "column-detail", path: "/columns/active-deep-learning-evidence" },
  { name: "strategy-detail", path: "/strategies/ai-in-education" },
  { name: "seasonal-july", path: "/seasonal/july" },
  { name: "subjects-index", path: "/subjects" },
  { name: "concerns-index", path: "/concerns" },
  { name: "guide-index", path: "/guide" },
  { name: "glossary", path: "/guide/glossary" },
  { name: "about", path: "/about" },
  { name: "faq", path: "/faq" },
  { name: "voices", path: "/voices" },
  { name: "policy-evidence", path: "/policy-evidence" },
  { name: "search", path: "/search" },
  { name: "not-found", path: "/404" },
];

for (const p of pages) {
  test(p.name, async ({ page }) => {
    await page.goto(p.path, { waitUntil: "networkidle" });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => window.scrollTo(0, 0));

    await expect(page).toHaveScreenshot(`${p.name}.png`, { fullPage: true });
  });
}
