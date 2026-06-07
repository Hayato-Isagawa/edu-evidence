/**
 * dist の linkinator 走査 + 既知 broken リンクのベースライン照合
 *
 * a11y 検査(e2e/a11y-known-issues.json + scripts/a11y-baseline.mjs)と同じ
 * ベースライン方式。ボット対策で 403/503 等を返す既知ドメインの URL を
 * scripts/links-known-issues.json で管理し、ベースラインにない新規破損のみ
 * 失敗として報告する。
 *
 * 分類:
 *   - NEW   … baseline に無い URL、または baseline にあっても今回 404 / 410 /
 *             network error(ボット対策 403 → 本物の消滅 404 への変化も検知)
 *   - known … baseline にあり、404 / 410 / 0 以外 → ホスト別サマリ表示のみ
 *   - stale … baseline にあるが今回 broken でない(直った)→ 情報表示のみ
 *
 * exit code:
 *   - 0 … NEW broken なし(known / stale は失敗にしない)
 *   - 1 … NEW broken あり
 *   - 2 … dist 不在 / 予期せぬ例外
 *
 * 使い方:
 *   npm run check:links      … 照合モード
 *   npm run links:baseline   … baseline 再生成(常に exit 0)
 *   既知 broken は別 PR で順次解消し、再生成して baseline を縮める
 */

import fs from "node:fs";
import path from "node:path";
import { check, LinkState } from "linkinator";

const BASELINE_PATH = path.resolve("scripts/links-known-issues.json");
const DIST_DIR = path.resolve("dist");

// 旧 CLI `linkinator dist --recurse --skip '...'` と同一挙動を維持する設定。
// - linksToSkip は 1 要素のまま渡す(CLI と同じ正規表現 OR 評価)
// - timeout / userAgent / retry は渡さない(UA を変えると 403 を返す母集合が
//   変わり baseline が実態とずれるため、旧 CLI のデフォルトを踏襲)
const CHECK_OPTIONS = {
  path: "dist",
  recurse: true,
  linksToSkip: ["mailto:|^#|doi\\.org/10\\.1037|us\\.corwin\\.com"],
  concurrency: 100,
};

// 「確定した消滅 / 到達不能」とみなす status。baseline 登録済みでも NEW 扱い。
// (check-source-links.ts の categorize と同じ思想。0 = network error / timeout)
const HARD_BROKEN_STATUSES = new Set([404, 410, 0]);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function statusLabel(status: number): string {
  return status === 0 ? "network error" : `HTTP ${status}`;
}

function loadBaseline(): Record<string, number> {
  if (!fs.existsSync(BASELINE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as Record<string, number>;
}

interface ScanResult {
  broken: Map<string, number>;
  totalChecked: number;
  skippedCount: number;
}

async function scan(): Promise<ScanResult> {
  const result = await check(CHECK_OPTIONS);
  // BROKEN は同一 URL が parent ごとに複数件返るため、URL でユニーク化する
  const broken = new Map<string, number>();
  let skippedCount = 0;
  for (const link of result.links) {
    if (link.state === LinkState.SKIPPED) skippedCount++;
    if (link.state !== LinkState.BROKEN) continue;
    if (!broken.has(link.url)) {
      broken.set(link.url, link.status ?? 0);
    }
  }
  return { broken, totalChecked: result.links.length, skippedCount };
}

function writeBaseline(broken: Map<string, number>) {
  const entries = [...broken.entries()].sort(([a], [b]) => a.localeCompare(b));
  const hardBroken = entries.filter(([, status]) => HARD_BROKEN_STATUSES.has(status));
  const baseline = Object.fromEntries(
    entries.filter(([, status]) => !HARD_BROKEN_STATUSES.has(status)),
  );

  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(
    `Baseline written to ${path.relative(process.cwd(), BASELINE_PATH)} (${Object.keys(baseline).length} entries)`,
  );

  if (hardBroken.length > 0) {
    console.error("");
    console.error("⚠️ 以下は 404 / 410 / network error のため baseline に登録しませんでした。");
    console.error("   本当に壊れている可能性が高いので、リンク自体を修正してください:");
    for (const [url, status] of hardBroken) {
      console.error(`   - ${url} → ${statusLabel(status)}`);
    }
  }
}

function reportAndJudge(broken: Map<string, number>, baseline: Record<string, number>): number {
  const newBroken: Array<[string, number]> = [];
  const knownBroken: Array<[string, number]> = [];

  for (const [url, status] of broken) {
    if (url in baseline && !HARD_BROKEN_STATUSES.has(status)) {
      knownBroken.push([url, status]);
    } else {
      newBroken.push([url, status]);
    }
  }

  const stale = Object.keys(baseline).filter((url) => !broken.has(url));

  if (newBroken.length > 0) {
    console.log(`## ❌ 新規 broken リンク(要対応)`);
    console.log("");
    for (const [url, status] of newBroken.sort(([a], [b]) => a.localeCompare(b))) {
      const note =
        url in baseline ? "(baseline 登録済みだが 404 / 410 / network error に変化)" : "";
      console.log(`- ${url} → ${statusLabel(status)}${note}`);
    }
    console.log("");
  }

  if (knownBroken.length > 0) {
    const byHost = new Map<string, number>();
    for (const [url] of knownBroken) {
      const h = hostOf(url);
      byHost.set(h, (byHost.get(h) ?? 0) + 1);
    }
    console.log(`## ℹ️ [known] 既知ボット対策ドメイン(baseline 登録済み、ブラウザでは通常 200)`);
    console.log("");
    for (const [h, n] of [...byHost.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`- ${h}: ${n} 件`);
    }
    console.log("");
  }

  if (stale.length > 0) {
    console.log(`## 🧹 stale エントリ(baseline 登録済みだが今回 broken でない)`);
    console.log("");
    for (const url of stale) {
      console.log(`- ${url}`);
    }
    console.log("");
    console.log("`npm run links:baseline` で再生成すると baseline を縮められます。");
    console.log("");
  }

  console.log(`## 集計`);
  console.log(`- ❌ 新規 broken: ${newBroken.length}`);
  console.log(`- ℹ️ 既知 (baseline): ${knownBroken.length}`);
  console.log(`- 🧹 stale: ${stale.length}`);

  if (newBroken.length > 0) {
    console.error(
      `\n新規 broken リンクが ${newBroken.length} 件あります。リンクを修正するか、` +
        "ボット対策ドメインであれば `npm run links:baseline` で baseline を更新してください。",
    );
    return 1;
  }
  return 0;
}

async function main(): Promise<number> {
  if (!fs.existsSync(DIST_DIR)) {
    console.error("dist/ がありません。先に `npm run build` を実行してください。");
    return 2;
  }

  const updateMode = process.argv.includes("--update-baseline");

  console.log(`=== check:links(linkinator + baseline 照合)===`);
  console.log(`対象: dist / モード: ${updateMode ? "baseline 再生成" : "照合"}`);
  console.log("");

  const { broken, totalChecked, skippedCount } = await scan();
  console.log(
    `検査リンク: ${totalChecked}(SKIPPED ${skippedCount} / BROKEN ユニーク ${broken.size})`,
  );
  console.log("");

  if (updateMode) {
    writeBaseline(broken);
    return 0;
  }

  return reportAndJudge(broken, loadBaseline());
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
