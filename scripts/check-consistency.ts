/**
 * 整合性チェックスクリプト
 *
 * 以下 3 段階のチェックを実行する。不一致があれば exit code 1。
 *
 *   1. 同一ファイル内整合(戦略ページ)
 *      frontmatter の monthsGained と本文の「約 X ヶ月」「+X ヶ月」を照合
 *
 *   2. コラム内の戦略参照整合(ファイル間、Issue #43)
 *      ・コラム本文で「戦略名(+N ヶ月)」を書いた場合、その戦略ページの
 *        monthsGained と N を照合(既存)
 *      ・コラム本文で `[任意](/strategies/<slug>)` のインラインリンクを
 *        書いた際、同じ行に現れる「+N ヶ月」を順序対応で突合し、
 *        `<slug>.md` の monthsGained と一致するか検証(新規)
 *
 *   3. 用語集・ツールチップの参照整合
 *      glossary.astro / glossary.ts 内の戦略名(+N ヶ月)を照合(既存)
 *
 * 使い方: npx tsx scripts/check-consistency.ts
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const STRATEGIES_DIR = path.resolve("src/content/strategies");
const COLUMNS_DIR = path.resolve("src/content/columns");

interface Issue {
  file: string;
  line: number;
  expected: number;
  found: string;
  context: string;
}

const issues: Issue[] = [];

function checkFile(filePath: string, isColumn = false) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const fileName = path.basename(filePath);
  const monthsGained = data.monthsGained as number | undefined;

  if (monthsGained === undefined) return;

  const lines = content.split("\n");
  const abs = Math.abs(monthsGained);

  // 本文中の「約Xヶ月」「+Xヶ月」「-Xヶ月」パターンを検出
  // frontmatter 行数のオフセットを計算
  const frontmatterLines = raw.split("---")[1]?.split("\n").length ?? 0;
  const offset = frontmatterLines + 2; // --- の2行分

  lines.forEach((line, i) => {
    // 「約Xヶ月分前進」「約Xヶ月分の学習効果」のパターン
    const bodyMonthPatterns = [
      /約(\d+)ヶ月分/g,
      /\+(\d+)ヶ月分/g,
    ];

    for (const pattern of bodyMonthPatterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const foundValue = parseInt(match[1], 10);
        if (foundValue !== abs && foundValue !== monthsGained) {
          // 他の戦略への言及かどうかチェック
          // 「メタ認知(+8ヶ月)」のような他戦略の引用は除外
          const surroundingText = line.substring(
            Math.max(0, match.index - 20),
            match.index + match[0].length + 5
          );
          // 自分のページ名が含まれているか、一般的な記述か
          issues.push({
            file: fileName,
            line: i + offset,
            expected: monthsGained,
            found: match[0],
            context: surroundingText.trim(),
          });
        }
      }
    }
  });

  // コラムの場合: 戦略の効果量への言及もチェック
  if (isColumn) {
    checkColumnReferences(filePath, lines, offset);
    checkColumnStrategyLinks(filePath, lines, offset);
  }
}

// 戦略ファイルの monthsGained マップを作成(title キー)
function buildStrategyMap(): Map<string, number> {
  const map = new Map<string, number>();
  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    if (data.title && data.monthsGained !== undefined) {
      map.set(data.title as string, data.monthsGained as number);
    }
  }
  return map;
}

// 戦略ファイルの monthsGained マップを作成(slug キー)
// Issue #43 の column → strategy インラインリンク整合チェック用
function buildStrategySlugMap(): Map<string, number> {
  const map = new Map<string, number>();
  const files = fs.readdirSync(STRATEGIES_DIR).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    if (data.monthsGained !== undefined) {
      const slug = file.replace(/\.md$/, "");
      map.set(slug, data.monthsGained as number);
    }
  }
  return map;
}

// コラム本文の [任意](/strategies/<slug>) と同一行の「+N ヶ月」を順序対応で突合
// (Issue #43: 数値直接書き写しのズレを検出)
function checkColumnStrategyLinks(
  filePath: string,
  lines: string[],
  offset: number,
) {
  const slugMap = buildStrategySlugMap();

  lines.forEach((line, i) => {
    // 行内の /strategies/<slug> リンクをすべて取得(順序を保持)
    const linkRe = /\[[^\]]+\]\(\/strategies\/([a-z0-9-]+)\)/g;
    const slugs: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(line)) !== null) slugs.push(m[1]);
    if (slugs.length === 0) return;

    // 行内の「+N ヶ月」「-N ヶ月」「+N / +M ヶ月」をすべて取得
    // 「ヵ月」「ヶ月」いずれも許容、スラッシュ区切り複合表記(表セル型)も分解して個別値に
    const monthGroupRe = /([+-]?\d+(?:\s*\/\s*[+-]?\d+)*)\s*[ヶヵ]月/g;
    const months: number[] = [];
    while ((m = monthGroupRe.exec(line)) !== null) {
      const parts = m[1].split(/\s*\/\s*/).map((s) => parseInt(s, 10));
      months.push(...parts);
    }
    if (months.length === 0) return;

    const pushIssue = (slug: string, found: number) => {
      const expected = slugMap.get(slug);
      if (expected === undefined) return;
      if (expected === found) return;
      issues.push({
        file: path.basename(filePath),
        line: i + offset,
        expected,
        found: `[${slug}] ${found >= 0 ? "+" : ""}${found}ヶ月`,
        context: `strategies/${slug}.md の monthsGained は ${
          expected >= 0 ? "+" : ""
        }${expected}`,
      });
    };

    if (slugs.length === months.length) {
      // リンク数と月数が一致: 順序対応で突合
      slugs.forEach((slug, idx) => pushIssue(slug, months[idx]));
    } else if (slugs.length === 1) {
      // リンク 1 つ: 最初の月数とのみ突合(誤検知を避けるため多対一はスキップ)
      pushIssue(slugs[0], months[0]);
    }
    // リンク数 ≠ 月数 かつリンク複数のケースは、順序対応が曖昧なのでスキップ
  });
}

function checkColumnReferences(
  filePath: string,
  lines: string[],
  offset: number
) {
  const strategyMap = buildStrategyMap();

  lines.forEach((line, i) => {
    // 「戦略名(+Xヶ月)」パターンを検出
    const refPattern = /(.+?)[（(]\+?(-?\d+)ヶ月[）)]/g;
    let match;
    while ((match = refPattern.exec(line)) !== null) {
      const refName = match[1].replace(/\*\*/g, "").trim();
      const refValue = parseInt(match[2], 10);

      // 戦略マップで照合
      for (const [title, monthsGained] of strategyMap) {
        if (refName.includes(title) || title.includes(refName)) {
          if (refValue !== monthsGained) {
            issues.push({
              file: path.basename(filePath),
              line: i + offset,
              expected: monthsGained,
              found: `${refName}(${refValue > 0 ? "+" : ""}${refValue}ヶ月)`,
              context: `戦略「${title}」の値は ${monthsGained > 0 ? "+" : ""}${monthsGained}`,
            });
          }
          break;
        }
      }
    }
  });
}

// 実行
console.log("=== 整合性チェック開始 ===\n");

// 戦略ファイル
const strategyFiles = fs
  .readdirSync(STRATEGIES_DIR)
  .filter((f) => f.endsWith(".md"));
for (const file of strategyFiles) {
  checkFile(path.join(STRATEGIES_DIR, file));
}

// コラムファイル
if (fs.existsSync(COLUMNS_DIR)) {
  const columnFiles = fs
    .readdirSync(COLUMNS_DIR)
    .filter((f) => f.endsWith(".md"));
  for (const file of columnFiles) {
    checkFile(path.join(COLUMNS_DIR, file), true);
  }
}

// 用語集・ツールチップデータ: 戦略名に続く「(+Xヶ月)」を戦略マップで照合
function checkGlossaryFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf-8");
  const strategyMap = buildStrategyMap();
  const lines = raw.split("\n");

  lines.forEach((line, i) => {
    // 「戦略名(+Xヶ月)」パターン。ただし汎用的なテンプレート文字列は除外
    const refPattern = /([^\s"`（(]+?)[（(]\+?(-?\d+)ヶ月[）)]/g;
    let match;
    while ((match = refPattern.exec(line)) !== null) {
      const refName = match[1].replace(/\*\*/g, "").trim();
      const refValue = parseInt(match[2], 10);

      for (const [title, monthsGained] of strategyMap) {
        if (refName === title || refName.endsWith(title) || title.endsWith(refName)) {
          if (refValue !== monthsGained) {
            issues.push({
              file: path.basename(filePath),
              line: i + 1,
              expected: monthsGained,
              found: `${refName}(${refValue > 0 ? "+" : ""}${refValue}ヶ月)`,
              context: `戦略「${title}」の値は ${monthsGained > 0 ? "+" : ""}${monthsGained}`,
            });
          }
          break;
        }
      }
    }
  });
}

checkGlossaryFile(path.resolve("src/pages/guide/glossary.astro"));
checkGlossaryFile(path.resolve("src/data/glossary.ts"));

// 結果出力
if (issues.length === 0) {
  console.log("✓ 不一致は見つかりませんでした。\n");
  process.exit(0);
} else {
  console.log(`✗ ${issues.length} 件の不一致が見つかりました:\n`);
  for (const issue of issues) {
    console.log(`  ${issue.file}:${issue.line}`);
    console.log(`    期待値: ${issue.expected > 0 ? "+" : ""}${issue.expected}ヶ月`);
    console.log(`    検出: ${issue.found}`);
    console.log(`    文脈: ${issue.context}`);
    console.log("");
  }
  process.exit(1);
}
