/**
 * 文体検査スクリプト(観点 12.5: 接続・談話標識の反復)
 *
 * 対象: src/content/strategies/*.md + src/content/columns/*.md
 *
 * 検出基準(`.claude/agents/edu-content-reviewer.md` 観点 12.5 参照):
 *   - 対象語: 文頭の「そして」/ だからこそ / つまり / 言い換えれば / 大切なのは / 重要なのは / 本当の意味で
 *   - 「そして」は行頭か「。」の直後だけを数える(「A、B、そして C」の列挙は数えない)
 *   - info: 同一語が 2 回、または対象語の合計が 4 回以上
 *   - warn: 同一語が 3 回以上、または連続する 2 段落の頭がともに対象語
 *
 * exit code: 常に 0(観点 12.5 は info / warn のみ。reviewer が結果を前提に判断する)
 * 使い方: npx tsx scripts/check-connectors.ts
 *
 * Markdown 構造の扱い:
 *   - frontmatter とコードブロック(```) 内は対象外
 *   - 見出し・リスト等の行も数える(対象語はリスト行にも現れる)
 *   - 段落 = 空行で区切ったブロック。コードブロックも区切りになる。
 *     見出しやリストのブロックも 1 段落として数えるので、連続判定を切る
 *   - 段落頭 = ブロック先頭行の行頭が対象語で始まること
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

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
const SOSHITE_PATTERN = /(^|。)そして/g;

const SAME_WORD_INFO = 2;
const SAME_WORD_WARN = 3;
const TOTAL_INFO = 4;

type Severity = "info" | "warn";

interface Block {
  startLine: number;
  firstLine: string;
}

interface Hit {
  file: string;
  severity: Severity;
  counts: Map<string, number>;
  total: number;
  consecutiveHeads: [number, number][];
}

function countOccurrences(text: string, word: string): number {
  let n = 0;
  let i = text.indexOf(word);
  while (i !== -1) {
    n++;
    i = text.indexOf(word, i + word.length);
  }
  return n;
}

function checkFile(filePath: string): Hit | null {
  const raw = fs.readFileSync(filePath, "utf8");
  const { content } = matter(raw);
  const lines = content.split("\n");

  const bodyLines: string[] = [];
  const blocks: Block[] = [];
  let inCodeBlock = false;
  let inBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      inBlock = false;
      continue;
    }
    if (inCodeBlock) continue;
    if (line.trim() === "") {
      inBlock = false;
      continue;
    }
    bodyLines.push(line);
    if (!inBlock) {
      blocks.push({ startLine: i + 1, firstLine: line.trimStart() });
      inBlock = true;
    }
  }

  const counts = new Map<string, number>();
  const body = bodyLines.join("\n");
  counts.set(
    SOSHITE,
    bodyLines.reduce((n, l) => n + (l.match(SOSHITE_PATTERN) ?? []).length, 0)
  );
  for (const w of WORDS) counts.set(w, countOccurrences(body, w));

  const isHead = (b: Block) =>
    HEAD_WORDS.some((w) => b.firstLine.startsWith(w));
  const consecutiveHeads: [number, number][] = [];
  for (let i = 1; i < blocks.length; i++) {
    if (isHead(blocks[i - 1]) && isHead(blocks[i])) {
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
  const files = [...listMarkdown(STRATEGIES_DIR), ...listMarkdown(COLUMNS_DIR)];
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
}

main();
