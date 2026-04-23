/**
 * 純粋な SVG 折れ線グラフ生成ユーティリティ
 *
 * 依存ライブラリなし。文字列として SVG を組み立てて返す。
 * remark-chart プラグイン(ビルド時)および Astro コンポーネント両方から
 * 同じ関数を利用できるよう、副作用のない pure 関数で実装する。
 */

export interface LineSeries {
  name: string;
  data: number[];
  color?: "accent" | "sub" | "ink" | string;
}

export interface LineChartSpec {
  type: "line";
  title?: string;
  xLabels: (string | number)[];
  series: LineSeries[];
  yMin?: number;
  yMax?: number;
  yTickStep?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  caption?: string;
  ariaLabel: string;
}

const WIDTH = 640;
const HEIGHT = 400;
const PADDING = { top: 88, right: 24, bottom: 68, left: 56 };
const TITLE_Y = 28;
const LEGEND_Y = 56; // title と描画領域の間に凡例を配置

const COLOR_MAP: Record<string, string> = {
  accent: "var(--color-accent)",
  sub: "var(--color-sub)",
  ink: "var(--color-ink)",
  red: "var(--color-chart-red)",
};

function resolveColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  return COLOR_MAP[color] ?? color;
}

function escapeHtml(s: string | number): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function niceExtent(values: number[], spec: LineChartSpec): { min: number; max: number } {
  const flat = values.filter((v) => Number.isFinite(v));
  if (flat.length === 0) return { min: 0, max: 1 };
  const rawMin = Math.min(...flat);
  const rawMax = Math.max(...flat);
  const margin = Math.max(1, (rawMax - rawMin) * 0.1);
  const min = spec.yMin ?? Math.floor((rawMin - margin) / 10) * 10;
  const max = spec.yMax ?? Math.ceil((rawMax + margin) / 10) * 10;
  return { min, max: Math.max(max, min + 1) };
}

function buildTicks(min: number, max: number, step: number | undefined): number[] {
  const tickStep = step ?? chooseStep(max - min);
  const ticks: number[] = [];
  for (let v = Math.ceil(min / tickStep) * tickStep; v <= max; v += tickStep) {
    ticks.push(Number(v.toFixed(6)));
  }
  if (ticks[0] !== min) ticks.unshift(min);
  if (ticks[ticks.length - 1] !== max) ticks.push(max);
  return ticks;
}

function chooseStep(range: number): number {
  if (range <= 20) return 5;
  if (range <= 50) return 10;
  if (range <= 100) return 20;
  if (range <= 200) return 50;
  return Math.ceil(range / 5);
}

export function renderLineChartSVG(spec: LineChartSpec, chartId: string): string {
  if (spec.type !== "line" || !spec.series?.length || !spec.xLabels?.length) {
    return "";
  }

  const innerW = WIDTH - PADDING.left - PADDING.right;
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;

  const allValues = spec.series.flatMap((s) => s.data);
  const { min: yMin, max: yMax } = niceExtent(allValues, spec);
  const yTicks = buildTicks(yMin, yMax, spec.yTickStep);

  const xCount = spec.xLabels.length;
  const xStep = xCount > 1 ? innerW / (xCount - 1) : 0;

  const xPos = (i: number): number => PADDING.left + i * xStep;
  const yPos = (v: number): number =>
    PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const fallbackColors = ["var(--color-accent)", "var(--color-sub)", "var(--color-ink)"];

  // タイトル
  const titleEl = spec.title
    ? `<text x="${WIDTH / 2}" y="${TITLE_Y}" text-anchor="middle" font-size="14" font-weight="600" fill="var(--color-ink)">${escapeHtml(spec.title)}</text>`
    : "";

  // Y 軸目盛 + 水平グリッド
  const yTicksMarkup = yTicks
    .map((t) => {
      const y = yPos(t).toFixed(1);
      return `
    <line x1="${PADDING.left}" y1="${y}" x2="${PADDING.left + innerW}" y2="${y}" stroke="var(--color-border, rgba(0,0,0,0.08))" stroke-width="1" />
    <text x="${PADDING.left - 8}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="var(--color-sub)">${escapeHtml(t)}</text>`;
    })
    .join("");

  // X 軸ラベル
  const xLabelsMarkup = spec.xLabels
    .map((label, i) => {
      const x = xPos(i).toFixed(1);
      const y = (PADDING.top + innerH + 18).toFixed(1);
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="var(--color-sub)">${escapeHtml(label)}</text>`;
    })
    .join("\n    ");

  // 軸ライン
  const axisLines = `
    <line x1="${PADDING.left}" y1="${PADDING.top + innerH}" x2="${PADDING.left + innerW}" y2="${PADDING.top + innerH}" stroke="var(--color-ink)" stroke-width="1.5" />
    <line x1="${PADDING.left}" y1="${PADDING.top}" x2="${PADDING.left}" y2="${PADDING.top + innerH}" stroke="var(--color-ink)" stroke-width="1.5" />`;

  // 系列(折れ線 + ドット)
  const seriesMarkup = spec.series
    .map((s, sIdx) => {
      const color = resolveColor(s.color, fallbackColors[sIdx % fallbackColors.length]);
      const pathData = s.data
        .map((v, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`)
        .join(" ");
      const dots = s.data
        .map(
          (v, i) =>
            `<circle cx="${xPos(i).toFixed(1)}" cy="${yPos(v).toFixed(1)}" r="4" fill="${color}" stroke="var(--color-bg, #fff)" stroke-width="2" />`,
        )
        .join("\n    ");
      return `
    <g role="presentation" data-series-name="${escapeHtml(s.name)}">
      <path d="${pathData}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      ${dots}
    </g>`;
    })
    .join("");

  // 軸ラベル
  const axisLabels: string[] = [];
  if (spec.xAxisLabel) {
    axisLabels.push(
      `<text x="${(PADDING.left + PADDING.left + innerW) / 2}" y="${HEIGHT - 18}" text-anchor="middle" font-size="11" fill="var(--color-sub)">${escapeHtml(spec.xAxisLabel)}</text>`,
    );
  }
  if (spec.yAxisLabel) {
    const cx = 16;
    const cy = PADDING.top + innerH / 2;
    axisLabels.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="11" fill="var(--color-sub)" transform="rotate(-90 ${cx} ${cy})">${escapeHtml(spec.yAxisLabel)}</text>`,
    );
  }

  // 凡例: title と描画領域の間に配置、title から十分な余白を確保
  const legendMarkup =
    spec.series.length > 1
      ? `
    <g transform="translate(${PADDING.left}, ${LEGEND_Y})">
      ${spec.series
        .map((s, sIdx) => {
          const color = resolveColor(s.color, fallbackColors[sIdx % fallbackColors.length]);
          const offset = sIdx * 110;
          return `
        <g transform="translate(${offset}, 0)">
          <line x1="0" y1="0" x2="18" y2="0" stroke="${color}" stroke-width="3" />
          <circle cx="9" cy="0" r="3" fill="${color}" />
          <text x="24" y="4" font-size="11" fill="var(--color-ink)">${escapeHtml(s.name)}</text>
        </g>`;
        })
        .join("")}
    </g>`
      : "";

  // 数値テーブル(アクセシビリティ)
  const tableHeader =
    `<tr><th scope="col">${escapeHtml(spec.xAxisLabel ?? "項目")}</th>` +
    spec.series.map((s) => `<th scope="col">${escapeHtml(s.name)}</th>`).join("") +
    `</tr>`;
  const tableRows = spec.xLabels
    .map((label, i) => {
      const cells = spec.series
        .map((s) => {
          const value = s.data[i];
          return `<td>${value === undefined || value === null ? "—" : escapeHtml(value)}</td>`;
        })
        .join("");
      return `<tr><th scope="row">${escapeHtml(label)}</th>${cells}</tr>`;
    })
    .join("");

  const captionMarkup = spec.caption
    ? `<figcaption class="chart-caption">${escapeHtml(spec.caption)}</figcaption>`
    : "";

  return `
<figure class="line-chart" data-chart-id="${escapeHtml(chartId)}">
  <svg viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(spec.ariaLabel)}" xmlns="http://www.w3.org/2000/svg">
    ${titleEl}
    ${yTicksMarkup}
    ${axisLines}
    ${xLabelsMarkup}
    ${seriesMarkup}
    ${axisLabels.join("\n    ")}
    ${legendMarkup}
  </svg>
  ${captionMarkup}
  <details class="chart-data-table">
    <summary>数値データを表形式で表示</summary>
    <table>
      <thead>${tableHeader}</thead>
      <tbody>${tableRows}</tbody>
    </table>
  </details>
</figure>
`.trim();
}
