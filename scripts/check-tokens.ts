/**
 * デザイントークンの規約チェック。
 *
 * 既存の 9 本の check スクリプトはすべてコンテンツ(数値・出典・リンク・文長)を
 * 見ており、CSS / クラスを見るものは 1 つも無かった。#411〜#421 で片付けた
 * 規約違反が再び入り込まないよう、機械で止める。
 *
 *   npx tsx scripts/check-tokens.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";

interface Finding {
  file: string;
  line: number;
  rule: string;
  text: string;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".astro")) out.push(p);
  }
  return out;
}

/** 定義済みトークンを global.css から読む(スクリプトに値を書き写さない)。 */
function definedColorTokens(): Set<string> {
  const css = readFileSync("src/styles/global.css", "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );
  const names = new Set<string>();
  for (const m of css.matchAll(/(--color-[a-z0-9-]+)\s*:/g)) names.add(m[1]);
  return names;
}

const RULES: {
  id: string;
  why: string;
  test: (line: string) => string | null;
}[] = [
  {
    id: "no-arbitrary-color",
    why: "色は @theme のトークンからユーティリティで参照する (ADR 0031)",
    test: (l) => l.match(/[a-z-]+-\[var\(--color-[a-z0-9-]+\)\]/)?.[0] ?? null,
  },
  {
    id: "no-palette-literal",
    why: "Tailwind パレット直書きは使わない。出典色は --color-source-* (ADR 0031)",
    test: (l) =>
      l.match(
        /\b(?:dark:)?(?:text|bg|border|ring|decoration)-(?:amber|rose|sky|emerald|red|green|blue|slate|gray|zinc|neutral|stone)-\d{2,3}\b/
      )?.[0] ?? null,
  },
  {
    id: "no-modifier-class",
    why: "状態は aria-* / data-* で表す。修飾子クラスを使わない (ADR 0007)",
    test: (l) => l.match(/class="[^"]*\bis-[a-z]+\b/)?.[0] ?? null,
  },
];

/**
 * motion-safe の検査だけはファイル全体を見る。
 *
 * クラス列がテンプレートリテラルで複数行にまたがることがあり
 * (`columns/index.astro` の tag-chip)、行単位では取りこぼす。実際に
 * 取りこぼして 72 箇所の素の transition が本番に出ていた。
 *
 * 素の `.transition` は prefers-reduced-motion のガード外に出るため、
 * reduce 環境でも動く(ビルド済み CSS で確認済み)。
 */
function motionSafeFindings(file: string, src: string): Finding[] {
  const out: Finding[] = [];
  const chunks = [
    ...src.matchAll(/"([^"]*)"/g),
    ...src.matchAll(/`([\s\S]*?)`/g),
  ];
  for (const m of chunks) {
    // 補間 ${...} の中は別のクラス列なので、外側の判定からは外す
    const cls = m[1].replace(/\$\{[\s\S]*?\}/g, " ");
    const line = src.slice(0, m.index).split("\n").length;

    const hasTransition =
      /(^|\s)(transition|transition-[a-z]+|animate-[a-z0-9-]+)(\s|$)/.test(cls);
    if (hasTransition && !cls.includes("motion-safe:")) {
      out.push({
        file,
        line,
        rule: "motion-safe-transition",
        text:
          cls.split(/\s+/).find((p) => /^(transition|animate-)/.test(p)) ??
          "transition",
      });
      continue;
    }

    if (/(^|\s)motion-safe:(transition|animate-)/.test(cls)) {
      const bare = cls
        .split(/\s+/)
        .find((p) => /^(duration-[0-9.]+|ease-[a-z-]+|delay-[0-9]+)$/.test(p));
      if (bare) {
        out.push({ file, line, rule: "motion-safe-timing", text: bare });
      }
    }
  }
  return out;
}

const WHY: Record<string, string> = {
  "motion-safe-transition":
    "transition / animate は motion-safe: を付ける (ADR 0008)",
  "motion-safe-timing":
    "transition と同じ列の duration / ease にも motion-safe: を付ける (ADR 0008)",
};

const defined = definedColorTokens();
const findings: Finding[] = [];

for (const file of walk(SRC)) {
  if (file.includes("/components/ui/")) {
    // ui/ は語彙そのものを持つ。パレット直書きだけは同じく禁止する。
  }
  const src = readFileSync(file, "utf8");
  src.split("\n").forEach((line, i) => {
    for (const rule of RULES) {
      const hit = rule.test(line);
      if (hit) findings.push({ file, line: i + 1, rule: rule.id, text: hit });
    }
  });
  findings.push(...motionSafeFindings(file, src));
}

// 未定義のトークンを参照していないか
for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\((--color-[a-z0-9-]+)\)/g)) {
      if (!defined.has(m[1]))
        findings.push({
          file,
          line: i + 1,
          rule: "unknown-token",
          text: m[1],
        });
    }
  });
}

if (findings.length === 0) {
  console.log(`✓ token checks passed (${RULES.length + 3} rules)`);
  process.exit(0);
}

const byRule = new Map<string, Finding[]>();
for (const f of findings) {
  const list = byRule.get(f.rule) ?? [];
  list.push(f);
  byRule.set(f.rule, list);
}

for (const [rule, list] of byRule) {
  const why =
    RULES.find((r) => r.id === rule)?.why ??
    WHY[rule] ??
    "定義されていないトークン";
  console.error(`\n✗ ${rule} — ${why}`);
  for (const f of list.slice(0, 20)) {
    console.error(`    ${f.file}:${f.line}  ${f.text}`);
  }
  if (list.length > 20) console.error(`    … 他 ${list.length - 20} 件`);
}
console.error(`\n${findings.length} 件の違反`);
process.exit(1);
