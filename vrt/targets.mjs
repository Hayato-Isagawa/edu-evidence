/**
 * VRT の撮影対象。`vrt/pages.spec.ts` と
 * `scripts/__tests__/workflows/vrt-targets.test.mjs` がこの 1 つの配列を共有する。
 *
 * **spec のソースを正規表現で読む形は採らない。** それだと引用符をシングルに変えた
 * だけで検査が落ち、逆にコメント行に `path: "…"` と書けば件数を水増しできる
 * (edu-law の実測)。データとして持てば、読む側は書き方に依存しない。
 *
 * テンプレート(`src/pages/` の `.astro`)1 本につき代表 URL を 1 件。動的ルート
 * (`[grade]` / `[subject]` / `[tag]` / `[...slug]`)は実在する値を 1 つ代表にする。
 * テンプレートを足したら 1 行足す — 対応が崩れると `vrt-targets.test.mjs` が
 * required check「Build site」で赤にする。
 *
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
 * 共通のヘッダー・フッター・FV は他のページが押さえている。このページに
 * 固有なのは日付・種別ラベル・リスト項目の描画で、面積は小さい。常に赤い検査や
 * 見逃す検査を置くより、対象外と明示するほうが正直だと判断した。
 *
 * @typedef {object} Target
 * @property {string} name テスト名。`vrt/__screenshots__/<project>/<name>.png` になる
 * @property {string} path 撮影する URL
 *
 * @type {Target[]}
 */
export const targets = [
  { name: "home", path: "/" },
  { name: "columns-index", path: "/columns" },
  { name: "column-detail", path: "/columns/active-deep-learning-evidence" },
  { name: "strategy-detail", path: "/strategies/ai-in-education" },
  { name: "seasonal-july", path: "/seasonal/july" },
  { name: "subjects-index", path: "/subjects" },
  { name: "subject-detail", path: "/subjects/算数" },
  { name: "grades-index", path: "/grades" },
  { name: "grade-detail", path: "/grades/高学年" },
  { name: "tags-index", path: "/tags" },
  { name: "tag-detail", path: "/tags/デジタル" },
  { name: "concerns-index", path: "/concerns" },
  { name: "cost-index", path: "/cost" },
  { name: "guide-index", path: "/guide" },
  { name: "guide-evidence", path: "/guide/evidence" },
  { name: "guide-indicators", path: "/guide/indicators" },
  { name: "guide-cultural-context", path: "/guide/cultural-context" },
  { name: "glossary", path: "/guide/glossary" },
  { name: "about", path: "/about" },
  { name: "faq", path: "/faq" },
  { name: "voices", path: "/voices" },
  { name: "support", path: "/support" },
  { name: "policy-evidence", path: "/policy-evidence" },
  { name: "search", path: "/search" },
  { name: "not-found", path: "/404" },
];

/**
 * 撮影オプション。`vrt/pages.spec.ts` が全件に渡し、
 * `scripts/__tests__/workflows/vrt-targets.test.mjs` が値を固定する。
 *
 * **spec の引数に直接書くと、値を弱めたことが required check から見えない。**
 * `fullPage` を落とすとビューポート内(desktop 1280x800 / mobile 390x844)しか
 * 撮らなくなるが、テストは全件走り続けて緑のまま通る — `threshold` の
 * 既定 0.2 がガードを黙って殺していた edu-law #160 と同じ形。config の
 * `expect.toHaveScreenshot` には `fullPage` を置けない(Playwright が
 * 受け付けるのはメソッド側だけ)ので、データとして持つ。
 *
 * **残る穴**: 呼び出し側の書き方は見ていない。渡すのをやめる / 渡したうえで
 * `{ ...shotOptions, threshold: 0.2 }` と上書きする(メソッド側の引数は config の
 * `expect.toHaveScreenshot` に優先する)/ widen した再エクスポートを挟む、の
 * いずれも素通りする。固定できるのは値であって、呼び出し側の書き方ではない。
 *
 * @type {{ fullPage: boolean }}
 */
export const shotOptions = { fullPage: true };
