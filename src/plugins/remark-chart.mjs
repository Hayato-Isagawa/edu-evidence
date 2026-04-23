/**
 * Remark plugin: {{chart:id}} を frontmatter.charts[id] の SVG グラフに置換
 *
 * 使用例(frontmatter):
 *   charts:
 *     finland-pisa:
 *       type: line
 *       title: フィンランドと日本の PISA 数学スコア推移
 *       xLabels: [2003, 2006, 2009, 2012, 2015, 2018, 2022]
 *       series:
 *         - { name: フィンランド, data: [544, 548, 541, 524, 511, 507, 484] }
 *         - { name: 日本,        data: [534, 523, 529, 536, 532, 527, 536] }
 *       ariaLabel: フィンランドと日本の PISA 数学スコアの 2003〜2022 年推移
 *
 * 本文:
 *   {{chart:finland-pisa}}
 *   → <figure class="line-chart">...<svg>...</svg>...</figure>
 *
 * frontmatter 自体のパースは Astro がしているので、このプラグインは
 * vfile.data.astro.frontmatter から charts 定義を取得する。
 */
import { visit } from "unist-util-visit";
import { renderLineChartSVG } from "../lib/chart-svg.ts";

const PATTERN = /\{\{chart:([a-z0-9-]+)\}\}/g;

export function remarkChart() {
  return (tree, file) => {
    const frontmatter = file?.data?.astro?.frontmatter;
    const charts = frontmatter?.charts;

    visit(tree, "paragraph", (node, index, parent) => {
      if (!parent || index === null || index === undefined) return;
      if (node.children.length !== 1) return;
      const textNode = node.children[0];
      if (textNode.type !== "text") return;

      const value = textNode.value;
      PATTERN.lastIndex = 0;
      const match = PATTERN.exec(value);
      if (!match) return;
      // プレースホルダーのみの段落を対象にする(他テキストと混在はしていない前提)
      if (match[0] !== value.trim()) return;

      const chartId = match[1];
      if (!charts || !charts[chartId]) {
        console.warn(`[remark-chart] Chart definition not found: ${chartId} (file: ${file?.path ?? "unknown"})`);
        return;
      }

      const spec = charts[chartId];
      const svgHtml = renderLineChartSVG(spec, chartId);
      if (!svgHtml) {
        console.warn(`[remark-chart] Failed to render chart: ${chartId}`);
        return;
      }

      parent.children.splice(index, 1, {
        type: "html",
        value: svgHtml,
      });
    });
  };
}
