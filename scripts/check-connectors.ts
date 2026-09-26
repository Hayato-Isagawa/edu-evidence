/**
 * 文体検査スクリプト(観点 12.5: 接続・談話標識の反復)
 *
 * 対象: src/content/strategies/*.md + src/content/columns/*.md
 *
 * 検出基準(`.claude/agents/edu-content-reviewer.md` 観点 12.5 参照):
 *   - 対象語: 文頭の「そして」/ だからこそ / つまり / 言い換えれば / 大切なのは / 重要なのは / 本当の意味で
 *   - 「そして」は数える文字(段落・見出し・表のセル・HTML の見える文字)の先頭か「。」の直後だけを数える
 *     (間の改行・空白は無視。「A、B、そして C」の列挙は数えない)
 *   - info: 同一語が 2 回、または対象語の合計が 4 回以上
 *   - warn: 同一語が 3 回以上、または連続する 2 段落の頭がともに対象語
 *
 * exit code: 検出結果では常に 0(観点 12.5 は info / warn のみ。reviewer が結果を前提に判断する)。
 *   対象の Markdown が 0 件なら 1(cwd の誤りを「報告 0 件」と取り違えないため)
 * 使い方: npx tsx scripts/check-connectors.ts
 * 行番号は frontmatter を含む実ファイルの行
 *
 * Markdown 構造の扱い(サイトと同じく mdast + GFM の構文木で読む):
 *   - 数えない: frontmatter・コードブロック(フェンス・字下げ)・インラインコード・HTML コメントの中・画像の代替テキスト。
 *     コメント以外の HTML の中の文字は数える(サイトで表示されるため)
 *   - 段落 = 構文木の段落。リスト項目・引用の中の段落も含み、並びは文書順(リストや引用の出入りでは切れない)
 *   - 段落頭 = 段落のテキストが対象語で始まること(強調は無視、インラインコードで始まる段落は段落頭にしない)
 *   - 連続を切る: 見出し・コードブロック・表・水平線・コメントだけではない HTML(<hr> や <img> も)
 *   - 連続に関わらない: コメントだけの HTML・リンク定義・脚注(脚注はページ末尾に出る)
 *   - 行番号は段落の開始行
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

const STRATEGIES_DIR = path.resolve("src/content/strategies");
const COLUMNS_DIR = path.resolve("src/content/columns");

const SOSHITE = "そして";
const WORDS = [
  "だからこそ",
  "つまり",
  "言い換えれば",
  "大切なのは",
  "重要なのは",
  "本当の意味で",
];
const HEAD_WORDS = [SOSHITE, ...WORDS];
// 「。」と「そして」の間の改行・空白は無視する(段落の途中で改行して書く記事がある)
const SOSHITE_PATTERN = /(^|。\s*)そして/g;

const SAME_WORD_INFO = 2;
const SAME_WORD_WARN = 3;
const TOTAL_INFO = 4;

type Severity = "info" | "warn";

/** 構文木のノード(使う分だけ) */
interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  position?: { start: { line: number } };
}

/** 段落の並びの 1 要素。段落頭になりうるのは段落だけで、それ以外は連続を切る */
interface Block {
  startLine: number;
  isHead: boolean;
}

interface Hit {
  file: string;
  severity: Severity;
  counts: Map<string, number>;
  total: number;
  consecutiveHeads: [number, number][];
}

const COMMENT = /<!--[\s\S]*?(?:-->|$)/g;

function countOccurrences(text: string, word: string): number {
  let n = 0;
  let i = text.indexOf(word);
  while (i !== -1) {
    n++;
    i = text.indexOf(word, i + word.length);
  }
  return n;
}

/**
 * テキストノードを集める。インラインコードは中身を数えず位置に印を残す
 * (コードで始まる段落を段落頭にせず、コードの直後の「そして」も数えないため)
 */
function textOf(node: MdNode): string {
  if (node.type === "text") return node.value ?? "";
  if (node.type === "inlineCode") return "\uFFFC";
  if (node.type === "html") return "";
  return (node.children ?? []).map(textOf).join("");
}

/** HTML のうち読者に見える文字(コメントとタグを除いたもの) */
function visibleHtml(value: string): string {
  return value.replace(COMMENT, "").replace(/<[^>]*>/g, "");
}

function checkFile(filePath: string): Hit | null {
  const raw = fs.readFileSync(filePath, "utf8");
  const { content } = matter(raw);
  // 報告する行番号を実ファイルの行に合わせる(frontmatter の行数を足す)
  const lineOffset = raw.split("\n").length - content.split("\n").length;
  const tree = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as MdNode;

  // 語を数える単位(段落・見出し・表のセルのテキストと、HTML の見える文字)
  const units: string[] = [];
  const blocks: Block[] = [];
  const lineOf = (n: MdNode) => (n.position?.start.line ?? 0) + lineOffset;

  const walk = (node: MdNode, inFootnote: boolean): void => {
    switch (node.type) {
      case "paragraph": {
        const text = textOf(node).trimStart();
        units.push(text);
        // 脚注はページ末尾に出るので、段落の並びには入れない
        if (!inFootnote) {
          blocks.push({
            startLine: lineOf(node),
            isHead: HEAD_WORDS.some((w) => text.startsWith(w)),
          });
        }
        return;
      }
      case "heading":
      case "tableCell":
        units.push(textOf(node).trimStart());
        if (node.type === "heading" && !inFootnote) {
          blocks.push({ startLine: lineOf(node), isHead: false });
        }
        return;
      case "html": {
        const value = node.value ?? "";
        // コメントだけの HTML は読者に見えないので、語も数えず連続も切らない。
        // それ以外(<hr> や <img> のように文字を持たないものも)は連続を切る
        if (value.replace(COMMENT, "").trim() === "") return;
        units.push(visibleHtml(value).trimStart());
        if (!inFootnote)
          blocks.push({ startLine: lineOf(node), isHead: false });
        return;
      }
      case "code":
      case "thematicBreak":
        if (!inFootnote)
          blocks.push({ startLine: lineOf(node), isHead: false });
        return;
      case "table":
        if (!inFootnote)
          blocks.push({ startLine: lineOf(node), isHead: false });
        break;
      case "definition":
        return;
    }
    const footnote = inFootnote || node.type === "footnoteDefinition";
    for (const child of node.children ?? []) walk(child, footnote);
  };
  walk(tree, false);

  const counts = new Map<string, number>();
  counts.set(
    SOSHITE,
    units.reduce((n, u) => n + (u.match(SOSHITE_PATTERN) ?? []).length, 0)
  );
  const body = units.join("\n");
  for (const w of WORDS) counts.set(w, countOccurrences(body, w));

  const consecutiveHeads: [number, number][] = [];
  for (let i = 1; i < blocks.length; i++) {
    if (blocks[i - 1].isHead && blocks[i].isHead) {
      consecutiveHeads.push([blocks[i - 1].startLine, blocks[i].startLine]);
    }
  }

  const values = [...counts.values()];
  const max = Math.max(...values);
  const total = values.reduce((a, b) => a + b, 0);

  let severity: Severity | null = null;
  if (max >= SAME_WORD_WARN || consecutiveHeads.length > 0) severity = "warn";
  else if (max >= SAME_WORD_INFO || total >= TOTAL_INFO) severity = "info";
  if (!severity) return null;

  return { file: filePath, severity, counts, total, consecutiveHeads };
}

function listMarkdown(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => path.join(dir, f));
}

function main(): void {
  const strategies = listMarkdown(STRATEGIES_DIR);
  const columns = listMarkdown(COLUMNS_DIR);
  const files = [...strategies, ...columns];
  if (files.length === 0) {
    console.error(
      `対象の Markdown が 0 件です。リポジトリのルートで実行してください(cwd: ${process.cwd()})`
    );
    process.exit(1);
  }
  const hits = files.map(checkFile).filter((h): h is Hit => h !== null);

  const order: Severity[] = ["warn", "info"];
  hits.sort((a, b) => {
    const sa = order.indexOf(a.severity);
    const sb = order.indexOf(b.severity);
    if (sa !== sb) return sa - sb;
    return a.file.localeCompare(b.file);
  });

  for (const h of hits) {
    const rel = path.relative(process.cwd(), h.file);
    const words = [...h.counts]
      .filter(([, n]) => n > 0)
      .map(([w, n]) => `${w}×${n}`)
      .join(" ");
    const heads = h.consecutiveHeads.map(([a, b]) => `L${a}-L${b}`).join(" ");
    const tail = heads ? ` 連続段落頭 ${heads}` : "";
    console.log(`[${h.severity}] ${rel} (${words} / 合計 ${h.total})${tail}`);
  }

  const warn = hits.filter((h) => h.severity === "warn").length;
  const info = hits.filter((h) => h.severity === "info").length;

  console.log("\n--- サマリ ---");
  console.log(`warn:     ${warn}`);
  console.log(`info:     ${info}`);
  console.log(`total:    ${hits.length}`);
  console.log(
    `files:    ${files.length} (strategies ${strategies.length} / columns ${columns.length})`
  );
}

main();
