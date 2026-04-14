/**
 * 整合性チェックスクリプト
 *
 * frontmatter の monthsGained と本文中の「約Xヶ月」「+Xヶ月」を照合し、
 * 不一致があれば警告を出力する。
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
  }
}

// 戦略ファイルの monthsGained マップを作成
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
