/**
 * 文体検査スクリプト(観点 12.4: 長文・節入れ子)
 *
 * 対象: src/content/strategies/*.md + src/content/columns/*.md
 *
 * 検出基準(`.claude/agents/edu-content-reviewer.md` 観点 12.4 参照):
 *   - 1 文 100 字超: info
 *   - 1 文 150 字超: warn
 *   - 1 文 200 字超: critical
 *   - 読点 4 個以上の文: info(独立判定、長さ基準と重複の場合は長さ判定を優先)
 *
 * exit code: critical 1 件以上 → 1、それ以外 → 0(reviewer 補完前提)
 * 使い方: npx tsx scripts/check-sentence-length.ts
 * 行番号は frontmatter を含む実ファイルの行で、文を含む段落の開始行(文そのものの行ではない)
 *
 * Markdown 構造の扱い(サイトと同じく mdast + GFM の構文木で読む):
 *   - frontmatter は対象外(gray-matter で剥がす)
 *   - 評価するのは最上位の段落だけ。コードブロック(フェンスの各形・字下げ)・見出し・リスト・引用・表・HTML・脚注は対象外
 *   - 段落の字数は段落のソースの文字で数える。URL / インラインコード / Markdown リンクは字数カウント時に正規化
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";

const STRATEGIES_DIR = path.resolve("src/content/strategies");
const COLUMNS_DIR = path.resolve("src/content/columns");

const LENGTH_INFO = 100;
const LENGTH_WARN = 150;
const LENGTH_CRITICAL = 200;
const COMMA_INFO_THRESHOLD = 4;

type Severity = "info" | "warn" | "critical";
type Reason = "length" | "comma";

/** 構文木のノード(使う分だけ) */
interface MdNode {
  type: string;
  children?: MdNode[];
  position?: {
    start: { line: number; offset?: number };
    end: { offset?: number };
  };
}

interface Hit {
  file: string;
  startLine: number;
  text: string;
  length: number;
  commas: number;
  severity: Severity;
  reason: Reason;
}

const URL_PATTERN = /https?:\/\/[^\s)\]]+/g;
const INLINE_CODE_PATTERN = /`[^`]+`/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\([^)]+\)/g;

function normalize(text: string): string {
  return text
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(INLINE_CODE_PATTERN, "")
    .replace(URL_PATTERN, "");
}

function classifyLength(length: number): Severity | null {
  if (length > LENGTH_CRITICAL) return "critical";
  if (length > LENGTH_WARN) return "warn";
  if (length > LENGTH_INFO) return "info";
  return null;
}

function analyzeBuffer(file: string, buffer: string, startLine: number): Hit[] {
  const cleaned = normalize(buffer).trim();
  if (!cleaned) return [];
  const sentences = cleaned.split(/(?<=。)/);
  const hits: Hit[] = [];

  for (const sent of sentences) {
    const trimmed = sent.trim();
    if (!trimmed) continue;
    if (!trimmed.endsWith("。")) continue; // 終端まで含まない断片は無視

    const length = trimmed.length;
    const commas = (trimmed.match(/、/g) ?? []).length;
    const preview = trimmed.slice(0, 30);

    const lenSev = classifyLength(length);
    if (lenSev) {
      hits.push({
        file,
        startLine,
        text: preview,
        length,
        commas,
        severity: lenSev,
        reason: "length",
      });
      continue;
    }
    if (commas >= COMMA_INFO_THRESHOLD) {
      hits.push({
        file,
        startLine,
        text: preview,
        length,
        commas,
        severity: "info",
        reason: "comma",
      });
    }
  }

  return hits;
}

function checkFile(filePath: string): Hit[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const { content } = matter(raw);
  // 報告する行番号を実ファイルの行に合わせる(frontmatter の行数を足す)
  const lineOffset = raw.split("\n").length - content.split("\n").length;
  const tree = fromMarkdown(content, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }) as MdNode;
  const hits: Hit[] = [];

  for (const node of tree.children ?? []) {
    if (node.type !== "paragraph" || !node.position) continue;
    const source = content
      .slice(node.position.start.offset, node.position.end.offset)
      .replace(/\n/g, " ");
    const startLine = node.position.start.line + lineOffset;
    hits.push(...analyzeBuffer(filePath, source, startLine));
  }

  return hits;
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
  const allHits: Hit[] = [];

  for (const f of files) {
    allHits.push(...checkFile(f));
  }

  const order: Severity[] = ["critical", "warn", "info"];
  const sorted = [...allHits].sort((a, b) => {
    const sa = order.indexOf(a.severity);
    const sb = order.indexOf(b.severity);
    if (sa !== sb) return sa - sb;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.startLine - b.startLine;
  });

  for (const h of sorted) {
    const rel = path.relative(process.cwd(), h.file);
    const tag = h.reason === "comma" ? `読点${h.commas}個` : `${h.length}字`;
    console.log(`[${h.severity}] ${rel}:${h.startLine} (${tag}) ${h.text}...`);
  }

  const critical = sorted.filter((h) => h.severity === "critical").length;
  const warn = sorted.filter((h) => h.severity === "warn").length;
  const info = sorted.filter((h) => h.severity === "info").length;

  console.log("\n--- サマリ ---");
  console.log(`critical: ${critical}`);
  console.log(`warn:     ${warn}`);
  console.log(`info:     ${info}`);
  console.log(`total:    ${sorted.length}`);

  if (critical > 0) {
    process.exit(1);
  }
}

main();
