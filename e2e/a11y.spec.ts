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
  { name: "コラム(jigsaw-two-lineages)", path: "/columns/jigsaw-two-lineages/" },
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

test.describe("a11y: axe-core 自動監査", () => {
  for (const { name, path } of targets) {
    test(`${name} (${path}) — 既知違反以外に critical/serious の違反がない`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(wcagTags)
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious"
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
        console.warn(`\n[a11y] ${name} (${path}):\n${summary}\n`);
      }

      // 新規違反のみテスト失敗扱い(既知違反は別 PR で順次解消)
      expect(
        newViolations,
        `新規 critical/serious 違反: ${newViolations.map((v) => v.id).join(", ")}`
      ).toEqual([]);
    });
  }
});
