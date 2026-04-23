/**
 * 純粋な SVG チャート生成ユーティリティ(折れ線・棒グラフ)
 *
 * 依存ライブラリなし。文字列として SVG を組み立てて返す。
 * remark-chart プラグイン(ビルド時)および Astro コンポーネント両方から
 * 同じ関数を利用できるよう、副作用のない pure 関数で実装する。
 */

export interface ChartSeries {
  name: string;
  data: number[];
  color?: "accent" | "sub" | "ink" | string;
}

// 後方互換用エイリアス
export type LineSeries = ChartSeries;

interface BaseChartSpec {
  title?: string;
  xLabels: (string | number)[];
  series: ChartSeries[];
  yMin?: number;
  yMax?: number;
  yTickStep?: number;
  xAxisLabel?: string;
  yAxisLabel?: string;
  caption?: string;
  ariaLabel: string;
}

export interface LineChartSpec extends BaseChartSpec {
  type: "line";
}

export interface BarChartSpec extends BaseChartSpec {
  type: "bar";
}

export type ChartSpec = LineChartSpec | BarChartSpec;

const WIDTH = 640;
const HEIGHT = 400;
const PADDING = { top: 88, right: 24, bottom: 68, left: 80 };
const TITLE_Y = 28;
const LEGEND_Y = 56; // title と描画領域の間に凡例を配置
const Y_AXIS_LABEL_X = 16;
const Y_TICK_LABEL_X_OFFSET = 8; // 目盛数字は PADDING.left - この値 に配置

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

function computeYAxis(
  values: number[],
  spec: BaseChartSpec,
): { min: number; max: number; step: number; ticks: number[] } {
  const flat = values.filter((v) => Number.isFinite(v));
  const rawMin = flat.length ? Math.min(...flat) : 0;
  const rawMax = flat.length ? Math.max(...flat) : 1;
  // 描画範囲のヒント(spec 指定があればそれ、なければ raw 値)から step を決める
  // これにより yMin: 0 指定時にも step は「0 からデータ上限」の range で選ばれる
  const hintMin = spec.yMin ?? rawMin;
  const hintMax = spec.yMax ?? rawMax;
  const hintRange = hintMax - hintMin || Math.max(1, Math.abs(hintMax) || 1);
  const step = spec.yTickStep ?? chooseStep(hintRange * 1.2);
  const min = spec.yMin ?? Math.floor(rawMin / step) * step;
  let max = spec.yMax ?? Math.ceil(rawMax / step) * step;
  if (max <= min) max = min + step;
  const ticks: number[] = [];
  for (let v = min; v <= max + step * 1e-6; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  return { min, max, step, ticks };
}

function chooseStep(range: number): number {
  // 小さい範囲は固定テーブル
  if (range <= 1) return 0.2;
  if (range <= 5) return 1;
  if (range <= 10) return 2;
  if (range <= 20) return 5;
  if (range <= 50) return 10;
  if (range <= 100) return 20;
  if (range <= 200) return 50;
  if (range <= 500) return 100;
  if (range <= 1000) return 200;
  // 大きい範囲: 10 の冪 × {1,2,5} の中で、目盛数が 4〜8 個になる刻みを選ぶ
  const pow10 = Math.pow(10, Math.floor(Math.log10(range)));
  for (const mult of [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5]) {
    const step = mult * pow10;
    const ticks = range / step;
    if (ticks >= 4 && ticks <= 8) return step;
  }
  return pow10;
}

function formatTick(v: number): string {
  if (!Number.isFinite(v)) return "";
  // 整数の大きい値は 3 桁カンマ区切り、それ以外は toString
  if (Number.isInteger(v) && Math.abs(v) >= 1000) {
    return v.toLocaleString("en-US");
  }
  return String(v);
}

export function renderChartSVG(spec: ChartSpec, chartId: string): string {
  if (spec.type === "bar") return renderBarChartSVG(spec, chartId);
  return renderLineChartSVG(spec, chartId);
}

export function renderLineChartSVG(spec: LineChartSpec, chartId: string): string {
  if (spec.type !== "line" || !spec.series?.length || !spec.xLabels?.length) {
    return "";
  }

  const innerW = WIDTH - PADDING.left - PADDING.right;
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;

  const allValues = spec.series.flatMap((s) => s.data).filter((v): v is number => v !== null);
  const { min: yMin, max: yMax, ticks: yTicks } = computeYAxis(allValues, spec);

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
    <text x="${PADDING.left - Y_TICK_LABEL_X_OFFSET}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="var(--color-sub)">${escapeHtml(formatTick(t))}</text>`;
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
    const cx = Y_AXIS_LABEL_X;
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

export function renderBarChartSVG(spec: BarChartSpec, chartId: string): string {
  if (spec.type !== "bar" || !spec.series?.length || !spec.xLabels?.length) {
    return "";
  }

  const innerW = WIDTH - PADDING.left - PADDING.right;
  const innerH = HEIGHT - PADDING.top - PADDING.bottom;

  const allValues = spec.series.flatMap((s) => s.data).filter((v): v is number => v !== null);
  const { min: yMin, max: yMax, ticks: yTicks } = computeYAxis(allValues, spec);

  const xCount = spec.xLabels.length;
  const categoryWidth = innerW / xCount;
  const groupWidth = categoryWidth * 0.7;
  const seriesCount = spec.series.length;
  const barWidth = groupWidth / seriesCount;

  const categoryCenter = (i: number): number =>
    PADDING.left + (i + 0.5) * categoryWidth;
  const yPos = (v: number): number =>
    PADDING.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const fallbackColors = ["var(--color-accent)", "var(--color-sub)", "var(--color-ink)"];

  const titleEl = spec.title
    ? `<text x="${WIDTH / 2}" y="${TITLE_Y}" text-anchor="middle" font-size="14" font-weight="600" fill="var(--color-ink)">${escapeHtml(spec.title)}</text>`
    : "";

  const yTicksMarkup = yTicks
    .map((t) => {
      const y = yPos(t).toFixed(1);
      return `
    <line x1="${PADDING.left}" y1="${y}" x2="${PADDING.left + innerW}" y2="${y}" stroke="var(--color-border, rgba(0,0,0,0.08))" stroke-width="1" />
    <text x="${PADDING.left - Y_TICK_LABEL_X_OFFSET}" y="${y}" text-anchor="end" dominant-baseline="middle" font-size="11" fill="var(--color-sub)">${escapeHtml(formatTick(t))}</text>`;
    })
    .join("");

  const xLabelsMarkup = spec.xLabels
    .map((label, i) => {
      const x = categoryCenter(i).toFixed(1);
      const y = (PADDING.top + innerH + 18).toFixed(1);
      return `<text x="${x}" y="${y}" text-anchor="middle" font-size="11" fill="var(--color-sub)">${escapeHtml(label)}</text>`;
    })
    .join("\n    ");

  const axisLines = `
    <line x1="${PADDING.left}" y1="${PADDING.top + innerH}" x2="${PADDING.left + innerW}" y2="${PADDING.top + innerH}" stroke="var(--color-ink)" stroke-width="1.5" />
    <line x1="${PADDING.left}" y1="${PADDING.top}" x2="${PADDING.left}" y2="${PADDING.top + innerH}" stroke="var(--color-ink)" stroke-width="1.5" />`;

  const baselineY = yPos(Math.max(yMin, 0));

  const seriesMarkup = spec.series
    .map((s, sIdx) => {
      const color = resolveColor(s.color, fallbackColors[sIdx % fallbackColors.length]);
      const bars = s.data
        .map((v, i) => {
          if (v === undefined || v === null || !Number.isFinite(v)) return "";
          const center = categoryCenter(i);
          const groupLeft = center - groupWidth / 2;
          const x = groupLeft + sIdx * barWidth + barWidth * 0.1;
          const bw = barWidth * 0.8;
          const topY = yPos(v);
          const y = Math.min(topY, baselineY);
          const h = Math.abs(baselineY - topY);
          const valueLabelY = (topY - 6).toFixed(1);
          const valueLabel = `<text x="${(x + bw / 2).toFixed(1)}" y="${valueLabelY}" text-anchor="middle" font-size="10" fill="var(--color-ink)">${escapeHtml(formatTick(v))}</text>`;
          return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="2" />${valueLabel}`;
        })
        .join("\n    ");
      return `
    <g role="presentation" data-series-name="${escapeHtml(s.name)}">
      ${bars}
    </g>`;
    })
    .join("");

  const axisLabels: string[] = [];
  if (spec.xAxisLabel) {
    axisLabels.push(
      `<text x="${(PADDING.left + PADDING.left + innerW) / 2}" y="${HEIGHT - 18}" text-anchor="middle" font-size="11" fill="var(--color-sub)">${escapeHtml(spec.xAxisLabel)}</text>`,
    );
  }
  if (spec.yAxisLabel) {
    const cx = Y_AXIS_LABEL_X;
    const cy = PADDING.top + innerH / 2;
    axisLabels.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" font-size="11" fill="var(--color-sub)" transform="rotate(-90 ${cx} ${cy})">${escapeHtml(spec.yAxisLabel)}</text>`,
    );
  }

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
          <rect x="0" y="-6" width="14" height="12" fill="${color}" rx="2" />
          <text x="20" y="4" font-size="11" fill="var(--color-ink)">${escapeHtml(s.name)}</text>
        </g>`;
        })
        .join("")}
    </g>`
      : "";

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
<figure class="line-chart bar-chart" data-chart-id="${escapeHtml(chartId)}">
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
