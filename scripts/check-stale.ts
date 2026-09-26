/**
 * 検証期限切れチェックスクリプト
 *
 * src/content/strategies/ の各 .md から lastVerified を読み取り、
 * しきい値(365 日)を超えて経過したエントリをリスト化する。
 *
 * 使い方: npx tsx scripts/check-stale.ts
 * 出力: Markdown (stdout)
 * exit code: 検出数 (0 = 問題なし、1+ = 検出あり)
 */

import fs from "fs";
import path from "path";
import matter from "gray-matter";

const STRATEGIES_DIR = path.resolve("src/content/strategies");

// 365 日。姉妹リポ edu-law の stale-check は 90 日で、4 倍の開きがあるが
// 意図的なもの。あちらが追うのは法令と公式解説で、法改正・解説の新版・通知の
// 追加発出によって実際に中身が変わる(edu-law ADR 0002 / docs/freshness-audit.md)。
// こちらが追うのはメタ分析と RCT で、2010 年の効果量は 2026 年でも同じ数値。
// 揃えるとどちらかが実態から外れる。
const STALE_THRESHOLD_DAYS = 365;

interface StaleEntry {
  file: string;
  lastVerified: string;
  daysSinceVerified: number;
}

interface MissingEntry {
  file: string;
}

interface InvalidEntry {
  file: string;
  value: string;
}

function parseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function main() {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );

  const stale: StaleEntry[] = [];
  const missing: MissingEntry[] = [];
  const invalid: InvalidEntry[] = [];

  const files = fs
    .readdirSync(STRATEGIES_DIR)
    .filter((f) => f.endsWith(".md"))
    .sort();

  for (const file of files) {
    const raw = fs.readFileSync(path.join(STRATEGIES_DIR, file), "utf-8");
    const { data } = matter(raw);
    const value = data.lastVerified;

    if (value === undefined || value === null || value === "") {
      missing.push({ file });
      continue;
    }

    if (typeof value !== "string") {
      invalid.push({ file, value: String(value) });
      continue;
    }

    const verifiedAt = parseDate(value);
    if (!verifiedAt) {
      invalid.push({ file, value });
      continue;
    }

    const days = daysBetween(verifiedAt, today);
    if (days > STALE_THRESHOLD_DAYS) {
      stale.push({
        file,
        lastVerified: value,
        daysSinceVerified: days,
      });
    }
  }

  const todayStr = today.toISOString().slice(0, 10);
  const lines: string[] = [];

  lines.push(`# 検証期限切れチェック (${todayStr})`);
  lines.push("");
  lines.push(`- しきい値: ${STALE_THRESHOLD_DAYS} 日`);
  lines.push(`- 対象: \`src/content/strategies/*.md\` (${files.length} 件)`);
  lines.push(
    `- 検出: stale ${stale.length} 件 / 未設定 ${missing.length} 件 / 不正 ${invalid.length} 件`
  );
  lines.push("");

  if (stale.length > 0) {
    lines.push(
      `## 検証期限切れ (${STALE_THRESHOLD_DAYS} 日超, ${stale.length} 件)`
    );
    lines.push("");
    stale.sort((a, b) => b.daysSinceVerified - a.daysSinceVerified);
    for (const entry of stale) {
      lines.push(
        `- \`strategies/${entry.file}\` — lastVerified: ${entry.lastVerified} (${entry.daysSinceVerified} 日経過)`
      );
    }
    lines.push("");
  }

  if (missing.length > 0) {
    lines.push(`## lastVerified 未設定 (${missing.length} 件)`);
    lines.push("");
    for (const entry of missing) {
      lines.push(`- \`strategies/${entry.file}\``);
    }
    lines.push("");
  }

  if (invalid.length > 0) {
    lines.push(`## lastVerified 形式不正 (${invalid.length} 件)`);
    lines.push("");
    for (const entry of invalid) {
      lines.push(`- \`strategies/${entry.file}\` — 値: \`${entry.value}\``);
    }
    lines.push("");
  }

  const total = stale.length + missing.length + invalid.length;

  if (total === 0) {
    lines.push(`すべての戦略が ${STALE_THRESHOLD_DAYS} 日以内に検証済みです。`);
    lines.push("");
  } else {
    lines.push("## 対応方法");
    lines.push("");
    lines.push(
      "1. 各戦略のページの出典(`sourceUrl`・`evidence` の各出典・`methodology.primaryEvidenceReview`)のどれかに当たり直す"
    );
    lines.push(
      "2. 取れた結果がすべて現在の値と一致すれば、frontmatter の `lastVerified` を今日の日付に更新"
    );
    lines.push(
      "3. 現在と違う値が確定したら、値(`monthsGained`・`evidenceStrength`・`evidence`・`methodology` など)と本文を直した上で `lastVerified` を更新。その場で直さない場合は `lastVerified` を更新せず、別の issue に起票"
    );
    lines.push(
      "4. 現在と違う値を示す結果が出たが確定できない、または何も取れなかった場合は、値も `lastVerified` も変えない"
    );
    lines.push("");
    lines.push("(詳細は docs/CONTENT_GUIDELINES.md「lastVerified の運用」)");
    lines.push("");
  }

  console.log(lines.join("\n"));

  process.exit(total);
}

main();
