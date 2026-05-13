/**
 * 読者リテラシー検査スクリプト
 *
 * 対象: src/content/strategies/*.md + src/content/columns/*.md
 *
 * 検出パターン:
 *   P1 (error)   英単語 + 漢字名詞混在(例: `FSM 児童`、`ChatGPT 群`)
 *   P2 (error)   英略語 [A-Z]{3,} で glossary 未登録(Markdown link 内・ホワイトリスト・P3 重複は除外)
 *   P3 (warning) 統計用語(10 種)の初出時括弧説明欠如
 *
 * exit code = P1 + P2 の総検出数(P3 は exit code 非算入)
 * 使い方: npx tsx scripts/check-reader-literacy.ts
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { glossary } from "../src/data/glossary.ts";

const STRATEGIES_DIR = path.resolve("src/content/strategies");
const COLUMNS_DIR = path.resolve("src/content/columns");

const P1_NOUNS = [
  "児童", "生徒", "者", "学習者", "群", "層",
  "教師", "教員", "学校", "学級", "学年", "授業",
];
const P1_PATTERN = new RegExp(
  `[a-zA-Z][a-zA-Z\\-]*\\s?(${P1_NOUNS.join("|")})`,
  "g",
);

const P2_PATTERN = /\b[A-Z]{3,}\b/g;
const GLOSSARY_KEYS = new Set<string>(
  glossary.flatMap((t) => [t.term, t.en]),
);

const P2_ALLOWED_ABBREVS = new Set<string>([
  "GIGA", "SNS", "WHO", "ADHD", "BMI", "CEO", "PDF", "GPS", "LINE", "NPO",
  "ISBN", "NBER", "NCES", "NICHD", "IES", "RAND", "JAMA", "IZA", "RIETI",
  "BERD", "IIEP", "MSS",
  "ASCD", "IHMC", "UNESCO", "UCL", "UCLA", "JICA", "APS", "ERIC", "PTA",
  "NEA", "USDA", "NSLP",
  "FIN", "NYC", "SYNODOS",
  "SAS", "PNAE", "POSHAN", "UIFSM", "FSMP", "MINJI",
  "IEEE", "SAT", "NFER", "DISS", "ICF", "SOS",
  "COCOLO",
]);

const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\([^)]*\)/g;

function getLinkRanges(line: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  MARKDOWN_LINK_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MARKDOWN_LINK_PATTERN.exec(line)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function isInRange(
  index: number,
  ranges: ReadonlyArray<readonly [number, number]>,
): boolean {
  return ranges.some(([s, e]) => index >= s && index < e);
}

const P3_TERMS: RegExp[] = [
  /\bquasi-experimental\b/g,
  /\bcluster RCT\b/gi,
  /\bANCOVA\b/g,
  /\bANOVA\b/g,
  /\bd\s*=\s*-?\d+\.\d+/g,
  /\bSD\s*=\s*-?\d+(?:\.\d+)?/g,
  /\bSE\s*=\s*-?\d+(?:\.\d+)?/g,
  /\b95\s*%\s*CI\b/gi,
  /\bOR\s*=\s*-?\d+(?:\.\d+)?/g,
  /\bp\s*[<>=]\s*0?\.\d+/g,
];

const P3_OVERLAP_ABBREVS = new Set<string>([
  "SD", "SE", "CI", "OR", "ANCOVA", "ANOVA",
]);

interface Issue {
  file: string;
  line: number;
  pattern: "P1" | "P2" | "P3";
  match: string;
  context: string;
}

function listMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => path.join(dir, f));
}

function sliceContext(line: string, index: number, length: number): string {
  return line
    .slice(Math.max(0, index - 20), index + length + 20)
    .trim();
}

function checkFile(filePath: string): Issue[] {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { content } = matter(raw);
  const frontmatterLines = raw.split("---")[1]?.split("\n").length ?? 0;
  const offset = frontmatterLines + 2;
  const relPath = path.relative(process.cwd(), filePath);
  const lines = content.split("\n");
  const issues: Issue[] = [];

  lines.forEach((line, i) => {
    P1_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = P1_PATTERN.exec(line)) !== null) {
      issues.push({
        file: relPath,
        line: i + offset,
        pattern: "P1",
        match: m[0],
        context: sliceContext(line, m.index, m[0].length),
      });
    }
  });

  const seenP2 = new Set<string>();
  lines.forEach((line, i) => {
    const linkRanges = getLinkRanges(line);
    P2_PATTERN.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = P2_PATTERN.exec(line)) !== null) {
      const abbr = m[0];
      if (GLOSSARY_KEYS.has(abbr)) continue;
      if (P2_ALLOWED_ABBREVS.has(abbr)) continue;
      if (P3_OVERLAP_ABBREVS.has(abbr)) continue;
      if (isInRange(m.index, linkRanges)) continue;
      if (seenP2.has(abbr)) continue;
      seenP2.add(abbr);
      issues.push({
        file: relPath,
        line: i + offset,
        pattern: "P2",
        match: abbr,
        context: sliceContext(line, m.index, abbr.length),
      });
    }
  });

  const seenP3 = new Set<string>();
  lines.forEach((line, i) => {
    for (const re of P3_TERMS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        const key = m[0].toLowerCase();
        if (seenP3.has(key)) continue;
        seenP3.add(key);
        const hasParens = /[(（][^)）]{1,40}[)）]/.test(line);
        if (!hasParens) {
          issues.push({
            file: relPath,
            line: i + offset,
            pattern: "P3",
            match: m[0],
            context: sliceContext(line, m.index, m[0].length),
          });
        }
      }
    }
  });

  return issues;
}

function formatIssue(i: Issue): string {
  return `- \`${i.file}:${i.line}\` — \`${i.match}\` … ${i.context}`;
}

function main() {
  const files = [
    ...listMarkdownFiles(STRATEGIES_DIR),
    ...listMarkdownFiles(COLUMNS_DIR),
  ];
  const all: Issue[] = files.flatMap(checkFile);
  const p1 = all.filter((i) => i.pattern === "P1");
  const p2 = all.filter((i) => i.pattern === "P2");
  const p3 = all.filter((i) => i.pattern === "P3");

  console.log("# 読者リテラシー検査\n");

  console.log(`## P1: 英単語 + 漢字名詞混在 (${p1.length} 件・error)\n`);
  p1.forEach((i) => console.log(formatIssue(i)));
  console.log();

  console.log(`## P2: 英略語 glossary 未登録 (${p2.length} 件・error)\n`);
  p2.forEach((i) => console.log(formatIssue(i)));
  console.log();

  console.log(
    `## P3: 統計用語の初出時括弧説明欠如 (${p3.length} 件・warning)\n`,
  );
  p3.forEach((i) => console.log(formatIssue(i)));
  console.log();

  console.log(`errors: ${p1.length + p2.length} / warnings: ${p3.length}`);

  process.exit(p1.length + p2.length);
}

main();
