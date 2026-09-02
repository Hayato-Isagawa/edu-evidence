// markdown 本文の用語リンク(`src/plugins/remark-glossary.mjs`)が、**文書順に関係なく
// 初出の用語をすべて拾う** ことを固定する。
//
// 2026-09-02 まで、このプラグインは用語を長さの降順に処理し、探索対象を「まだ処理して
// いない尾部」に狭めていた。長い用語がヒットするとその手前は探索から外れるので、
// **長い用語より前に出ている短い用語がリンクされない**(#510)。
// 「効果量の話。標準偏差も。」で「標準偏差」だけがリンクされ「効果量」が落ちる。
//
// markup は壊れないので、#505 の走査(属性値の中の `<`)では見つからない。読者からは
// 「同じ用語がページによってリンクされたりされなかったりする」形で見える。
//
// `glossary-inline.test.mjs` は子プロセスで tsx を挟むが、このプラグインは
// `../data/glossary.ts` を拡張子つきで import しているので Node 24 の型剥がしで
// そのまま読める。mdast を直接組んで、リンク・インラインコードの中も試せるようにする。
import test from "node:test";
import assert from "node:assert/strict";
import { remarkGlossary } from "../../src/plugins/remark-glossary.mjs";

/** 段落 1 つの mdast にプラグインを通し、描画順に連結して返す。 */
function render(children) {
  const tree = {
    type: "root",
    children: [{ type: "paragraph", children }],
  };
  remarkGlossary()(tree);
  return tree.children[0].children;
}

function toHtml(nodes) {
  return nodes
    .map((n) => {
      if (n.type === "text" || n.type === "html") return n.value;
      if (n.type === "inlineCode") return `<code>${n.value}</code>`;
      if (n.type === "link") return `<a href="${n.url}">${toHtml(n.children)}</a>`;
      if (n.type === "strong") return `<strong>${toHtml(n.children)}</strong>`;
      throw new Error(`unexpected node: ${n.type}`);
    })
    .join("");
}

const text = (value) => ({ type: "text", value });

function linkedTerms(html) {
  return [...html.matchAll(/class="glossary-tip"[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
}

test("長い用語より前に出ている短い用語もリンクされる", () => {
  // 「標準偏差」(4 文字)が「効果量」(3 文字)より先に処理される。旧実装は
  // 「標準偏差」の後ろだけを次の探索対象にするので、手前の「効果量」が落ちた。
  const html = toHtml(render([text("効果量の話。標準偏差も。")]));
  assert.deepEqual(
    linkedTerms(html),
    ["効果量", "標準偏差"],
    `文書順で両方リンクされていない:\n${html}`,
  );
  assert.match(
    html,
    /^<a class="glossary-tip" href="\/guide\/glossary#%E5%8A%B9%E6%9E%9C%E9%87%8F"[^>]*>効果量<\/a>の話。<a class="glossary-tip"[^>]*>標準偏差<\/a>も。$/,
    `本文の並びが崩れている:\n${html}`,
  );
});

test("長い用語に含まれる短い用語は、その中では別にリンクしない", () => {
  // 「クラスターRCT」の中の「RCT」。全体探索に変えても、既にリンクにした範囲と
  // 重なる出現を飛ばすので二重リンク・部分一致にならない。範囲外に改めて出た
  // 「RCT」は初出として拾う。
  const html = toHtml(render([text("日本初のクラスターRCTを公表。RCT 一般とは異なる。")]));
  assert.deepEqual(linkedTerms(html), ["クラスターRCT", "RCT"], html);
  assert.doesNotMatch(html, /<a\b[^>]*>[^<]*<a\b/, `リンクが入れ子になっている:\n${html}`);
  assert.match(html, /クラスターRCT<\/a>を公表。<a class="glossary-tip"[^>]*>RCT<\/a> 一般/, html);

  // 範囲外の出現が無ければ、短い方は 1 本も付かない(部分一致でリンクしない)。
  const only = toHtml(render([text("クラスターRCTの設計。")]));
  assert.deepEqual(linkedTerms(only), ["クラスターRCT"], only);
});

test("同じ用語は文書内で初出の 1 回しかリンクされない", () => {
  // 同じテキストノードの中でも、ノードをまたいでも(強調を挟む・段落が変わる)1 回。
  // `seen` は文書全体で共有される。
  const html = toHtml(
    render([
      text("効果量の話。あとで効果量が再び出る。"),
      { type: "strong", children: [text("強調")] },
      text("の後にも効果量。"),
    ]),
  );
  assert.deepEqual(linkedTerms(html), ["効果量"], `初出以外もリンクされた:\n${html}`);
  assert.match(html, /^<a class="glossary-tip"[^>]*>効果量<\/a>の話。あとで効果量が再び出る。/, html);
});

test("リンクの中とインラインコードの中の用語は触らない", () => {
  // markdown の `[効果量](…)` の中にリンクを挿すと `<a>` が入れ子になる。
  // `` `効果量` `` はコードとして見せたい表記で、用語リンクの対象ではない。
  // どちらも「出た」ことにはしないので、その後の本文側の初出にはリンクが付く。
  const nodes = render([
    { type: "link", url: "/guide/evidence", children: [text("効果量の読み方")] },
    text("と"),
    { type: "inlineCode", value: "効果量" },
    text("を参照。本文の効果量はここ。"),
  ]);
  const html = toHtml(nodes);
  assert.equal(nodes[0].type, "link");
  assert.deepEqual(nodes[0].children, [text("効果量の読み方")], `リンクの中が書き換えられた:\n${html}`);
  assert.equal(nodes[2].type, "inlineCode");
  assert.equal(nodes[2].value, "効果量", `インラインコードが書き換えられた:\n${html}`);
  assert.doesNotMatch(html, /<a\b[^>]*>[^<]*<a\b/, `リンクが入れ子になっている:\n${html}`);
  assert.match(html, /本文の<a class="glossary-tip"[^>]*>効果量<\/a>はここ。$/, `本文側の初出がリンクされていない:\n${html}`);
});
