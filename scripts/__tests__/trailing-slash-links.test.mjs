// ビルド後の HTML で内部リンクをスラッシュ付きにそろえる純関数
// (`src/plugins/trailing-slash-links.mjs`)の規則を固定する。
//
// 書き換えるのは `dist/<path>/index.html` が実在するパスだけで、それ以外は 1 文字も
// 変えない。規則が緩むとファイルへのリンク(`/rss.xml`)やリンク切れまでスラッシュが付き、
// 締まると 307 を挟むリンクが静かに戻る。どちらも描画は変わらないので VRT では見えない。
// 登録が外れた場合は E2E(`e2e/navigation.spec.ts`)が dist 全体を走査して拾う。
import test from "node:test";
import assert from "node:assert/strict";
import { addTrailingSlashToHrefs } from "../../src/plugins/trailing-slash-links.mjs";

const pages = new Set([
  "/strategies/metacognition",
  "/guide/glossary",
  "/search",
  "/tags/記憶",
]);

function rewrite(href, attr = "href") {
  return addTrailingSlashToHrefs(`<a ${attr}="${href}">x</a>`, pages);
}

test("ディレクトリのページを指す href にスラッシュを足す", () => {
  assert.equal(
    rewrite("/strategies/metacognition"),
    '<a href="/strategies/metacognition/">x</a>'
  );
});

test("#hash の手前に足す", () => {
  assert.equal(
    rewrite("/guide/glossary#効果量"),
    '<a href="/guide/glossary/#効果量">x</a>'
  );
});

test("?query の手前に足す", () => {
  assert.equal(rewrite("/search?q=a#b"), '<a href="/search/?q=a#b">x</a>');
});

test("スラッシュ付き・ルート・ルートの #hash は変えない", () => {
  for (const href of ["/strategies/metacognition/", "/", "/#strategy-list"]) {
    assert.equal(rewrite(href), `<a href="${href}">x</a>`);
  }
});

test("ファイルを指す href は変えない", () => {
  for (const href of [
    "/rss.xml",
    "/og/metacognition.png",
    "/pagefind/pagefind-ui.css",
  ]) {
    assert.equal(rewrite(href), `<a href="${href}">x</a>`);
  }
});

test("存在しないパスは変えない(リンク切れは check:links:internal に任せる)", () => {
  assert.equal(
    rewrite("/strategies/no-such-page"),
    '<a href="/strategies/no-such-page">x</a>'
  );
});

test("外部・プロトコル相対・mailto・# のみは変えない", () => {
  for (const href of [
    "https://edu-evidence.org/strategies/metacognition",
    "//edu-evidence.org/strategies/metacognition",
    "mailto:a@example.com",
    "#strategy-list",
  ]) {
    assert.equal(rewrite(href), `<a href="${href}">x</a>`);
  }
});

test("data-href と xlink:href は変えない", () => {
  for (const attr of ["data-href", "xlink:href"]) {
    assert.equal(
      rewrite("/strategies/metacognition", attr),
      `<a ${attr}="/strategies/metacognition">x</a>`
    );
  }
});

test("% エンコードされた日本語パスは decode して判定し、エンコードのまま足す", () => {
  const encoded = `/tags/${encodeURIComponent("記憶")}`;
  assert.equal(rewrite(encoded), `<a href="${encoded}/">x</a>`);
});

test("decode できない % は変えずに残す(ビルドを止めない)", () => {
  assert.equal(rewrite("/tags/%E8%A8"), '<a href="/tags/%E8%A8">x</a>');
});

test("1 つの HTML の中の複数の href をそれぞれ判定する", () => {
  const html =
    '<link rel="alternate" href="/rss.xml"><a href="/search">s</a><a class="g" href="/guide/glossary#x">g</a>';
  assert.equal(
    addTrailingSlashToHrefs(html, pages),
    '<link rel="alternate" href="/rss.xml"><a href="/search/">s</a><a class="g" href="/guide/glossary/#x">g</a>'
  );
});
