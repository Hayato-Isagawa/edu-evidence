// 用語ツールチップの変換が **自分で生成した markup を二度と探索しない** ことを固定する。
//
// 2026-09-01 まで、`src/lib/glossary-inline.ts` は置換後の文字列に対して `indexOf` を
// 掛けていた。直前に挿した `<a … href="…" data-tip="…">` の**属性値の中**が次の用語の
// 探索対象になり、属性値の途中にリンクが入る。ブラウザは最初の `"` で属性値を終端するので、
// ツールチップの本文もリンク先 URL も壊れる(本番 18 ページ / 22 箇所。#505)。
//
// **CI は全緑のままだった。** `astro check` は型しか見ず、textlint は Markdown ソース
// しか見ず、E2E も a11y 監査も属性値の中身までは届かない。この経路にはテストが 1 本も
// 無く、壊れたことを観測できる口がどこにも無かった。
//
// 経路は 2 つあるので両方を通す。markdown 本文側(`remark-glossary.mjs`)は探索対象を
// 元テキストの未処理の尾部に狭めており、同じ欠陥は持っていない。ここではその前提を
// 固定するために一緒に測る(欠陥が無いことも回帰の対象)。
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const HELPER = path.join(HERE, "helpers", "glossary-render.mjs");

/** 実装(TypeScript)に通した結果を受け取る。解決は tsx に任せる。 */
function render(payload) {
  const r = spawnSync("npx", ["tsx", HELPER], {
    cwd: REPO,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    timeout: 120_000,
  });
  assert.equal(
    r.status,
    0,
    `用語変換を実行できませんでした:\n${r.stdout ?? ""}${r.stderr ?? ""}`,
  );
  return JSON.parse(r.stdout);
}

/**
 * 引用符付き属性値の中に残った生の `<` を数える。壊れ方そのものを直接見る検査。
 *
 * **属性名を書かない。** #505 は `data-tip="[^"]*<a ` で走査していたが、それでは
 * `href` が壊れた 2 ページを取り逃がす(実測: data-tip 決め打ちで 16 ファイル、
 * 属性値一般で 18 ファイル / 22 箇所)。欠陥は「属性値の中にタグが入る」ことであって
 * 「data-tip が壊れる」ことではないので、属性名を固定した瞬間に検査の射程が
 * 実際の欠陥より狭くなる。次に壊れるのがどの属性かは、壊れてみるまで分からない。
 */
function corruptAttributes(html) {
  const hits = [];
  let inTag = false;
  let quote = null;
  for (let i = 0; i < html.length; i += 1) {
    const c = html[i];
    if (!inTag) {
      if (c === "<") inTag = true;
    } else if (quote) {
      if (c === quote) quote = null;
      else if (c === "<") {
        hits.push(html.slice(Math.max(0, i - 40), i + 40));
        quote = null;
      }
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ">") {
      inTag = false;
    }
  }
  return hits;
}

// 引き金になる形を、用語集データの実際の性質から選んでいる。
// どれも用語集としては正しいデータで、直すべきは探索側であってデータではない。
const CASES = [
  // 0: `short`(ツールチップ本文)が別の用語を含む。
  //    「標準偏差」の short = 「データのばらつきを示す指標(効果量計算でも使う)」
  "データのばらつきは標準偏差で示す。効果量も見る。",
  // 1: href のアンカーが別の用語を部分文字列に持つ(`#CASEL` の中の `SEL`)。
  "プログラム(CASEL 系など)と実施者で分かれる。",
  // 2: encodeURIComponent しても ASCII の `RCT` はアンカーに残る。
  "日本初のクラスターRCTを公表。RCT 一般とは異なる。",
  // 3: 強調の中に用語が入る(subject-specialist-teaching の culturalContext の形)。
  "日本初の**クラスターRCT**(2025)は二択ではない。",
  // 4: 用語を 1 つも含まない。常に何かを壊す実装で緑にならないための対照。
  "用語をひとつも含まない普通の文章です。",
];

const base = render({ inline: CASES, markdown: CASES });

// 用語ごとの全数走査。用語名は実装側から受け取るので、用語集が増えても追随する。
const perTerm = base.terms.map((term) => `${term}についての説明文です。`);
const everyTerm = base.terms.join("と");
// **markdown 側も同じ配列を通す。** 片方だけ全数走査にすると、走査している側の
// エスケープが壊れたときだけ赤くなり、もう片方は同じ欠陥でも緑のまま通る(実測:
// remark-glossary の escapeAttr から `<` を外しても 5 ケースでは検出できなかった)。
const sweep = render({ inline: [...perTerm, everyTerm], markdown: [...perTerm, everyTerm] });

test("ツールチップ本文の中にリンクを挿し込まない", () => {
  const html = base.inline[0];
  assert.equal(
    corruptAttributes(html).length,
    0,
    `属性値の中にタグが入っている:\n${html}`,
  );
  assert.match(html, /data-tip="データのばらつきを示す指標\(効果量計算でも使う\)"/);
});

test("リンク先 URL の中にリンクを挿し込まない", () => {
  // `#CASEL` の中の `SEL`。壊れると href="/guide/glossary#CA<a …>SEL</a>" になる。
  assert.equal(corruptAttributes(base.inline[1]).length, 0, base.inline[1]);
  assert.match(base.inline[1], /href="\/guide\/glossary#CASEL"/);

  // encodeURIComponent("クラスターRCT") の末尾に残る `RCT`。
  assert.equal(corruptAttributes(base.inline[2]).length, 0, base.inline[2]);
  assert.match(base.inline[2], /href="\/guide\/glossary#%E3%82%AF%E3%83%A9%E3%82%B9%E3%82%BF%E3%83%BCRCT"/);
});

test("属性値に紛れ込んだ用語が本文側の初出を食い潰さない", () => {
  // 壊れていたときは、属性値の中で見つかった時点でその用語が「出た」ことになり、
  // **本文側の初出にリンクが付かなくなっていた**。壊れた markup と同じ原因で
  // 起きる、読者から見えるもう 1 つの症状。
  const html = base.inline[0];
  assert.match(
    html,
    /で示す。<a class="glossary-tip" href="\/guide\/glossary#%E5%8A%B9%E6%9E%9C%E9%87%8F"[^>]*>効果量<\/a>も見る。$/,
    `本文側の初出がリンクされていない:\n${html}`,
  );

  // 同じことが href 側でも起きる。「クラスターRCT」の後の「RCT」。
  assert.match(base.inline[2], />RCT<\/a> 一般とは異なる。$/, base.inline[2]);
});

test("用語集の全エントリを通しても属性値が壊れない", (t) => {
  // 空の用語集なら 0 件でも緑になってしまうので、まず対象があることを見る。
  assert.ok(base.terms.length > 0, "用語集が空。検査対象 0 件でも緑になる");
  t.diagnostic(`用語 ${base.terms.length} 件 + 全用語を並べた 1 件を走査`);

  const broken = [];
  sweep.inline.forEach((html, i) => {
    const hits = corruptAttributes(html);
    if (hits.length) broken.push(`${base.terms[i] ?? "(全用語)"}: ${hits.join(" / ")}`);
  });
  assert.deepEqual(broken, [], `属性値の中にタグが入っている:\n${broken.join("\n")}`);
});

test("強調の中の用語もリンクされ、strong は保たれる", () => {
  const html = base.inline[3];
  assert.equal(corruptAttributes(html).length, 0, html);
  assert.match(
    html,
    /^日本初の<strong><a class="glossary-tip"[^>]*>クラスターRCT<\/a><\/strong>/,
    `強調の中の用語がリンクされていない:\n${html}`,
  );
});

test("用語を含まないテキストは素通しで返る", () => {
  assert.equal(base.inline[4], CASES[4]);
});

test("markdown 本文の経路も属性値を壊さない", () => {
  base.markdown.forEach((html, i) => {
    assert.equal(
      corruptAttributes(html).length,
      0,
      `markdown 経路で属性値が壊れた(case ${i}):\n${html}`,
    );
  });
  // 素通しではなくリンクが付いていることも見る(何もしない実装で緑にならないため)。
  assert.match(base.markdown[0], /class="glossary-tip"/);
});

test("markdown 経路も用語集の全エントリで属性値が壊れない", (t) => {
  // inline 側だけを全数走査していたとき、markdown 側の escapeAttr から `<` を
  // 外しても 5 ケースでは検出できなかった(実測)。2 経路は別々に壊れる。
  assert.ok(sweep.markdown.length > 0, "markdown 側の走査対象が 0 件");
  t.diagnostic(`markdown 経路も用語 ${base.terms.length} 件 + 全用語連結を走査`);

  const broken = [];
  sweep.markdown.forEach((html, i) => {
    const hits = corruptAttributes(html);
    if (hits.length) broken.push(`${base.terms[i] ?? "(全用語)"}: ${hits.join(" / ")}`);
  });
  assert.deepEqual(broken, [], `markdown 経路で属性値の中にタグが入っている:\n${broken.join("\n")}`);
});

test("入力に元からある a タグの中にはリンクを挿し込まない", () => {
  // faq.astro の回答文には手書きの `<a>` が実在する。その中に用語リンクを挿すと
  // `<a>` が入れ子になり、ブラウザは外側を強制的に閉じる。結果として**外側の
  // リンクのテキストが空**になり、クリックできずスクリーンリーダーからも名前が
  // 読めない(本番 /faq/ で 6 本。#505 のレビューが検出)。
  const [html] = render({
    inline: ['詳しくは<a href="/guide/evidence" class="link">エビデンス入門</a>を参照。'],
    markdown: [],
  }).inline;

  assert.doesNotMatch(
    html,
    /<a\b[^>]*>[^<]*<a\b/,
    `a タグが入れ子になっている:\n${html}`,
  );
  assert.match(html, />エビデンス入門<\/a>/, `外側リンクのテキストが失われた:\n${html}`);
});

test("生の不等号があってもリンクが止まらない", () => {
  // 分割の区切りを汎用の `<[^>]*>` にすると、frontmatter に実在する生の `>`
  // (「紙>デジタル」「教師 > 訓練を受けた補助員」)や `p < .001` を
  // タグと読み違えて、以降の用語が黙ってリンクされなくなる。
  const [html] = render({
    inline: ["p < .001。紙>デジタルの比較。効果量も見る。"],
    markdown: [],
  }).inline;

  assert.match(html, /class="glossary-tip"[^>]*>効果量<\/a>/, `不等号の後の用語が落ちた:\n${html}`);
  assert.equal(corruptAttributes(html).length, 0, html);
});

test("同じ用語は強調をまたいでも 1 回しかリンクされない", () => {
  // 片ごとに seen を作り直すと、`<strong>` を挟んだだけで同じ用語が二重に
  // リンクされる(実測: 実コンテンツ 3 ページで発生)。「用語ごと初出 1 回」は
  // 片をまたいで共有される seen が担保している。
  const [html] = render({
    inline: ["効果量の話。**強調**のあとにも効果量が出る。"],
    markdown: [],
  }).inline;

  const links = html.match(/class="glossary-tip"/g) ?? [];
  assert.equal(links.length, 1, `同じ用語が ${links.length} 回リンクされた:\n${html}`);
});
