/**
 * エビデンス強度(★)整合チェックスクリプト
 *
 * 以下 3 段階のチェックを実行する。不一致があれば exit code 1。
 *
 *   A. frontmatter の不変条件(戦略ページ)
 *      evidenceStrength(サイト独自の総合評価)が、出典別の評価
 *      evidence.{eef,japan}.strength のうち最も高いものに対して
 *      「同じ」か「1 段階上」であること。
 *      strength を持つ出典が 1 つも無いページは判定できないので対象外にし、
 *      件数と名前を毎回出す(黙って飛ばすと、緑が「整合している」なのか
 *      「見ていない」なのか区別できない)。hattie は schema に strength を
 *      持たないので出典に数えない。
 *      基準を最も強い出典に取るのは、日本の知見が弱くても EEF が強ければ
 *      総合が高いのは正しいため(例: early-years-intervention は
 *      総合 4 / eef 4 / japan 2 で、japan だけを基準にすると誤検出になる)。
 *
 *   B. 本文の「★N」とリンク先の evidenceStrength(ファイル間)
 *      `[任意](/strategies/<slug>)` と同じ行に現れる ★ を順序対応で突合する。
 *      対応付けのヒューリスティクスは check-consistency.ts の
 *      checkColumnStrategyLinks と同じ。
 *
 *   C. 本文の「★N」と戦略名(ファイル間)
 *      リンクを伴わない見出し等(「### 1. フィードバック(+6ヶ月・★5)」)向けに
 *      戦略名の部分一致で突合する。B が拾った行は対象外。
 *
 * 使い方: npx tsx scripts/check-evidence-strength.ts
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const STRATEGIES_DIR = path.resolve("src/content/strategies");
const COLUMNS_DIR = path.resolve("src/content/columns");

const EVIDENCE_SOURCES = ["eef", "japan"] as const;

interface Issue {
  file: string;
  line: number;
  message: string;
  context: string;
}

const issues: Issue[] = [];

// A の対象外になった戦略(strength を持つ出典が無い)。件数と名前を出力する
const unratedStrategies: string[] = [];
let invariantTargets = 0;

// 行内の ★ を読み取る。「★5」の数字形と「★★★★☆」の記号形の両方に対応
function extractStars(line: string): number[] {
  const stars: number[] = [];
  const re = /★(\d)|(★+)☆*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    stars.push(m[1] ? parseInt(m[1], 10) : m[2].length);
  }
  return stars;
}

// frontmatter の行数から本文の行番号オフセットを求める
// (raw の先頭 `---` 行 + frontmatter 本体 + 閉じ `---` 行 を数え、本文 1 行目の行番号にする)
function bodyOffset(raw: string): number {
  const frontmatterLines = raw.split("---")[1]?.split("\n").length ?? 0;
  return frontmatterLines + 1;
}

interface StrategyInfo {
  slug: string;
  title: string;
  strength: number;
}

function loadStrategies(): StrategyInfo[] {
  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".md"));
  const list: StrategyInfo[] = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    if (typeof data.evidenceStrength !== "number") continue;
    list.push({
      slug: file.replace(/\.md$/, ""),
      title: (data.title as string) ?? "",
      strength: data.evidenceStrength,
    });
  }
  return list;
}

// A. evidenceStrength と出典別 strength の不変条件
function checkFrontmatterInvariant() {
  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    const total = data.evidenceStrength;
    if (typeof total !== "number") continue;
    invariantTargets++;

    const evidence = data.evidence as
      | Record<string, { strength?: number } | undefined>
      | undefined;

    const rated: { src: string; strength: number }[] = [];
    for (const src of EVIDENCE_SOURCES) {
      const strength = evidence?.[src]?.strength;
      if (typeof strength === "number") rated.push({ src, strength });
    }
    if (rated.length === 0) {
      unratedStrategies.push(file);
      continue;
    }

    const strongest = rated.reduce((a, b) => (b.strength > a.strength ? b : a));
    const diff = total - strongest.strength;
    if (diff >= 0 && diff <= 1) continue;

    const detail = rated.map((e) => `${e.src} ★${e.strength}`).join(" / ");
    issues.push({
      file,
      line: 0,
      message:
        diff < 0
          ? `総合 ★${total} が最も強い出典(${strongest.src} ★${strongest.strength})を下回っています`
          : `総合 ★${total} が最も強い出典(${strongest.src} ★${strongest.strength})より ${diff} 段階高くなっています`,
      context: `出典別: ${detail} / 許容できる差は 0〜1 段階`,
    });
  }
}

// B. 本文の ★ とリンク先の evidenceStrength
// 戻り値は「B が照合済みの行」の集合(C で除外するため)
function checkStarLinks(
  filePath: string,
  lines: string[],
  offset: number,
  strategies: StrategyInfo[],
): Set<number> {
  const bySlug = new Map(strategies.map((s) => [s.slug, s]));
  const handled = new Set<number>();
  const fileName = path.basename(filePath);

  lines.forEach((line, i) => {
    const linkRe = /\[[^\]]+\]\(\/strategies\/([a-z0-9-]+)\)/g;
    const slugs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(line)) !== null) slugs.push(m[1]);
    if (slugs.length === 0) return;

    const stars = extractStars(line);
    if (stars.length === 0) return;

    const compare = (slug: string, found: number) => {
      const info = bySlug.get(slug);
      if (!info) return;
      handled.add(i);
      if (info.strength === found) return;
      issues.push({
        file: fileName,
        line: i + offset,
        message: `★${found} と書かれていますが、strategies/${slug}.md の evidenceStrength は ★${info.strength} です`,
        context: line.trim().slice(0, 80),
      });
    };

    if (slugs.length === stars.length) {
      slugs.forEach((slug, idx) => compare(slug, stars[idx]));
    } else if (slugs.length === 1) {
      compare(slugs[0], stars[0]);
    }
    // リンク数 ≠ ★数 かつリンク複数のケースは順序対応が曖昧なのでスキップ
  });

  return handled;
}

// C. リンクを伴わない行の「戦略名 + ★N」
function checkStarTitles(
  filePath: string,
  lines: string[],
  offset: number,
  strategies: StrategyInfo[],
  handled: Set<number>,
) {
  const fileName = path.basename(filePath);
  // 長いタイトルから先に照合し、短いタイトルの部分一致に負けないようにする
  const sorted = [...strategies]
    .filter((s) => s.title)
    .sort((a, b) => b.title.length - a.title.length);

  lines.forEach((line, i) => {
    if (handled.has(i)) return;
    if (/\[[^\]]+\]\(\/strategies\//.test(line)) return;

    const stars = extractStars(line);
    if (stars.length === 0) return;

    const hit = sorted.find((s) => line.includes(s.title));
    if (!hit) return;
    if (hit.strength === stars[0]) return;

    issues.push({
      file: fileName,
      line: i + offset,
      message: `★${stars[0]} と書かれていますが、戦略「${hit.title}」の evidenceStrength は ★${hit.strength} です`,
      context: line.trim().slice(0, 80),
    });
  });
}

function checkBody(filePath: string, strategies: StrategyInfo[]) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { content } = matter(raw);
  const lines = content.split("\n");
  const offset = bodyOffset(raw);

  const handled = checkStarLinks(filePath, lines, offset, strategies);
  checkStarTitles(filePath, lines, offset, strategies, handled);
}

// 実行
console.log("=== エビデンス強度(★)整合チェック開始 ===\n");

const strategies = loadStrategies();

checkFrontmatterInvariant();

// 保護範囲の可視化。A は strength を持つ出典が無いページを判定できないので飛ばす。
// 件数を出さないと、strength を外しただけでそのページが黙って対象外になっても気づけない。
console.log(
  `不変条件 A の対象外(strength を持つ出典が無い戦略): ${unratedStrategies.length} / ${invariantTargets}` +
    (unratedStrategies.length > 0
      ? `\n  ${unratedStrategies.sort().join("\n  ")}\n`
      : "\n"),
);

for (const dir of [STRATEGIES_DIR, COLUMNS_DIR]) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    checkBody(path.join(dir, file), strategies);
  }
}

if (issues.length === 0) {
  console.log("✓ 不一致は見つかりませんでした。\n");
  process.exit(0);
} else {
  console.log(`✗ ${issues.length} 件の不一致が見つかりました:\n`);
  for (const issue of issues) {
    const where = issue.line > 0 ? `${issue.file}:${issue.line}` : issue.file;
    console.log(`  ${where}`);
    console.log(`    ${issue.message}`);
    console.log(`    文脈: ${issue.context}`);
    console.log("");
  }
  process.exit(1);
}
