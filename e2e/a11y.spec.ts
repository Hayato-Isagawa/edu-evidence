import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import knownIssues from "./a11y-known-issues.json" with { type: "json" };

interface AuditTarget {
  name: string;
  path: string;
}

const targets: AuditTarget[] = [
  { name: "トップページ", path: "/" },
  { name: "悩みから探す", path: "/concerns/" },
  { name: "戦略詳細(feedback)", path: "/strategies/feedback/" },
  {
    name: "コラム(jigsaw-two-lineages)",
    path: "/columns/jigsaw-two-lineages/",
  },
  { name: "検索", path: "/search/" },
  { name: "用語集", path: "/guide/glossary/" },
  { name: "About", path: "/about/" },
  { name: "Voices", path: "/voices/" },
];

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface KnownIssues {
  [path: string]: string[];
}
const known = knownIssues as KnownIssues;

// ライト/ダーク双方を検査する。ダークだけで落ちる配色(dark: 変種の付け忘れ)を
// 取り逃がさないため。実際にコントラスト違反 24 件がダーク側だけで発生していた。
const themes = ["light", "dark"] as const;

test.describe("a11y: axe-core 自動監査", () => {
  for (const theme of themes) {
    for (const { name, path } of targets) {
      test(`[${theme}] ${name} (${path}) — 既知違反以外に critical/serious の違反がない`, async ({
        page,
      }) => {
        // 読み込み後に data-theme を差し替えると色トランジションが走り、
        // axe が遷移途中の中間色を拾って誤検知する。localStorage を先に
        // 仕込み、head のブートストラップに初回描画から目的のテーマを
        // 適用させる(実際のユーザーの再訪と同じ経路)。
        await page.addInitScript((t) => {
          try {
            localStorage.setItem("theme", t);
          } catch {
            /* private browsing 等では諦める */
          }
        }, theme);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const results = await new AxeBuilder({ page })
          .withTags(wcagTags)
          .analyze();

        const blocking = results.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        );
        const allowed = new Set(known[path] ?? []);
        const newViolations = blocking.filter((v) => !allowed.has(v.id));

        // 既知違反のレポート(警告)
        if (blocking.length > 0) {
          const summary = blocking
            .map((v) => {
              const tag = allowed.has(v.id) ? "[known]" : "[NEW]";
              return `  ${tag} [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)\n    → ${v.helpUrl}`;
            })
            .join("\n");
          console.warn(`\n[a11y] [${theme}] ${name} (${path}):\n${summary}\n`);
        }

        // 新規違反のみテスト失敗扱い(既知違反は別 PR で順次解消)
        expect(
          newViolations,
          `新規 critical/serious 違反: ${newViolations.map((v) => v.id).join(", ")}`,
        ).toEqual([]);
      });
    }
  }
});
