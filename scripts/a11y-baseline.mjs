#!/usr/bin/env node
/**
 * a11y ベースライン抽出スクリプト
 *
 * 各監査対象ページに axe-core を流し、critical / serious の違反 ID を
 * `e2e/a11y-known-issues.json` に書き出す。
 *
 * 使い方:
 *   1. ローカルで `npm run dev` を別タブで起動
 *   2. `node scripts/a11y-baseline.mjs http://localhost:4321`
 *   3. 既知違反は別 PR で順次解消し、このスクリプトを再実行して baseline を縮める
 */
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const baseURL = process.argv[2] ?? "http://localhost:4321";

const targets = [
  { name: "トップページ", path: "/" },
  { name: "悩みから探す", path: "/concerns/" },
  { name: "戦略詳細(feedback)", path: "/strategies/feedback/" },
  { name: "コラム(jigsaw-two-lineages)", path: "/columns/jigsaw-two-lineages/" },
  { name: "検索", path: "/search/" },
  { name: "用語集", path: "/guide/glossary/" },
  { name: "About", path: "/about/" },
  { name: "Voices", path: "/voices/" },
];

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const browser = await chromium.launch();
const context = await browser.newContext();
const baseline = {};

for (const { name, path } of targets) {
  const page = await context.newPage();
  await page.goto(`${baseURL}${path}`);
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );
  const ids = blocking.map((v) => v.id).sort();
  baseline[path] = ids;
  console.log(`${name} (${path}): ${ids.length} known issues`);
  for (const v of blocking) {
    console.log(`  [${v.impact}] ${v.id}: ${v.help}`);
  }
  await page.close();
}

await browser.close();

const outPath = join(__dirname, "..", "e2e", "a11y-known-issues.json");
writeFileSync(outPath, JSON.stringify(baseline, null, 2) + "\n");
console.log(`\nBaseline written to ${outPath}`);
