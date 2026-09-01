#!/usr/bin/env node
// 用語リンクの 2 経路にテキストを通して、結果をそのまま返すだけの薄いラッパー。
//
//   - frontmatter 経路 … src/lib/glossary-inline.ts の annotateGlossaryTerms
//   - markdown 本文経路 … src/plugins/remark-glossary.mjs の remarkGlossary
//
// **なぜ子プロセスを挟むのか。** `node --test` が拾うのは `.mjs` だけで
// (package.json の glob)、`glossary-inline.ts` は `../data/glossary` を
// **拡張子なしで** import している。Node 24 は型剥がしまでは通すが ESM の解決で
// ERR_MODULE_NOT_FOUND になる(実測)。既存の check-scripts.test.mjs と同じく、
// 解決は `npx tsx` に任せる。
//
// **仕様はここに置かない。** 入力は stdin の JSON、出力は素の結果。
// 何が正しいかの判断はすべて呼び出し側のテストが持つ。ここに期待値を書くと、
// テストと実装の間にもう 1 つ古くなる場所が増える。
//
// 入力: { "inline": string[], "markdown": string[] }
// 出力: { "inline": string[], "markdown": string[], "terms": string[] }
import { annotateGlossaryTerms } from "../../../src/lib/glossary-inline.ts";
import { remarkGlossary } from "../../../src/plugins/remark-glossary.mjs";
import { glossary } from "../../../src/data/glossary.ts";

/**
 * markdown 本文経路。段落 1 つだけの mdast に通し、描画される順に連結して返す。
 * text ノードと html ノードのどちらも `value` を持つので、そのまま繋げば
 * ブラウザが受け取るのと同じ並びになる。
 */
function renderMarkdown(text) {
  const tree = {
    type: "root",
    children: [{ type: "paragraph", children: [{ type: "text", value: text }] }],
  };
  remarkGlossary()(tree);
  return tree.children[0].children.map((node) => node.value).join("");
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));

process.stdout.write(
  JSON.stringify({
    inline: (input.inline ?? []).map(annotateGlossaryTerms),
    markdown: (input.markdown ?? []).map(renderMarkdown),
    terms: glossary.map((entry) => entry.term),
  }),
);
