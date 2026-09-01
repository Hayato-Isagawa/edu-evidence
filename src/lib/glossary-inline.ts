import { glossary, type GlossaryTerm } from "../data/glossary";

const sorted = [...glossary].sort((a, b) => b.term.length - a.term.length);

const STRONG_PATTERN = /\*\*([^*]+?)\*\*/g;

/**
 * 自分で作った `<strong>` と、入力に元からある `<a>` だけを区切りにするための組。
 *
 * 汎用の `<[^>]*>` では分割しない。frontmatter には生の `>` が実在し
 * (「紙>デジタル」「教師 > 訓練を受けた補助員」)、`p < .001` のような表記が
 * 1 つ入った時点で、本文をタグと読み違えて用語リンクが静かに止まる。
 * `<a\b` は単語境界を要求するので `p < .001` の `< ` には当たらない。
 */
const STRONG_SPLIT = /(<\/?strong>|<a\b[^>]*>|<\/a>)/;
const STRONG_TAG = /^(<\/?strong>|<a\b[^>]*>|<\/a>)$/;
const LINK_OPEN = /^<a\b/;

function renderLink(entry: GlossaryTerm): string {
  const anchor = entry.term.replace(/[()（）]/g, "").replace(/\s+/g, "-");
  const escapedShort = entry.short
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  const escapedTerm = entry.term
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<a class="glossary-tip" href="/guide/glossary#${encodeURIComponent(anchor)}" data-tip="${escapedShort}">${escapedTerm}</a>`;
}

/**
 * テキスト片の中の用語をリンクに置き換える。
 *
 * **探索するのは引数のテキストだけで、生成したリンクは二度と探索しない。**
 * 以前は置換後の文字列に対して `indexOf` を掛けていたため、直前に挿した
 * `<a … href="…" data-tip="…">` の**属性値の中**が次の用語の探索対象になり、
 * 属性値の途中にリンクが入って HTML が壊れていた(本番 18 ページ / 22 箇所)。
 * 引き金は 2 つあり、どちらも用語集データとしては正しい:
 *
 *   - `short` が別の用語を含む   … 「標準偏差」の説明文に「効果量」が出る
 *   - href が別の用語を含む      … `#CASEL` の中の `SEL`、
 *                                  `encodeURIComponent("クラスターRCT")` 末尾の `RCT`
 *
 * 壊れた markup と同時に、**本来付くはずのリンクも消えていた**。属性値の中で
 * 見つかった時点でその用語が `seen` に入るため、本文側の初出が素通りしていた。
 */
function linkTerms(segment: string, seen: Set<string>): string {
  const claims: { start: number; end: number; entry: GlossaryTerm }[] = [];

  for (const entry of sorted) {
    if (seen.has(entry.term)) continue;

    // 既にリンクにした範囲と重なる出現は飛ばす(「クラスターRCT」の中の「RCT」)。
    // 長い用語を先に処理する並び順は、この重なり判定と対で意味を持つ。
    let idx = segment.indexOf(entry.term);
    while (idx !== -1) {
      const end = idx + entry.term.length;
      const at = idx;
      if (!claims.some((c) => at < c.end && c.start < end)) break;
      idx = segment.indexOf(entry.term, idx + 1);
    }
    if (idx === -1) continue;

    seen.add(entry.term);
    claims.push({ start: idx, end: idx + entry.term.length, entry });
  }

  if (claims.length === 0) return segment;

  claims.sort((a, b) => a.start - b.start);

  let out = "";
  let cursor = 0;
  for (const claim of claims) {
    out += segment.slice(cursor, claim.start);
    out += renderLink(claim.entry);
    cursor = claim.end;
  }
  return out + segment.slice(cursor);
}

/**
 * Markdown 強調 `**...**` を `<strong>` に変換した上で、
 * テキスト中の用語集用語の初出をツールチップリンクに変換する。
 * Astro テンプレートの set:html で使用。
 */
export function annotateGlossaryTerms(text: string): string {
  const seen = new Set<string>();

  // `<strong>` を先に作るのは、強調の中に用語が入る実例があるため
  // (subject-specialist-teaching の culturalContext)。作った直後にタグと
  // テキストへ分け、以降はテキスト片だけを探索対象にする。
  // `seen` は片をまたいで共有するので、「初出のみ」は文書順のまま保たれる。
  // 入力に元から入っている `<a>` の中は探索しない。中に用語リンクを挿すと
  // `<a>` が入れ子になり、ブラウザが外側を強制的に閉じてリンクのテキストが空になる
  // (faq.astro の回答文には手書きの `<a>` が実在する)。markdown 経路の
  // remark-glossary が `parent.type === "link"` で同じことをしている。
  let insideLink = false;

  return text
    .replace(STRONG_PATTERN, "<strong>$1</strong>")
    .split(STRONG_SPLIT)
    .map((part) => {
      if (LINK_OPEN.test(part)) {
        insideLink = true;
        return part;
      }
      if (part === "</a>") {
        insideLink = false;
        return part;
      }
      if (STRONG_TAG.test(part)) return part;
      return insideLink ? part : linkTerms(part, seen);
    })
    .join("");
}
