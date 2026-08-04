// ?raw で CSS をそのまま文字列として取り込む。色の実値を持つのは global.css
// だけにするため(src/pages/design-tokens.json.ts と同じ方式)。
import css from "../styles/global.css?raw";

/**
 * 効果量(monthsGained)と エビデンス強度(evidenceStrength)の表示ロジック。
 *
 * これらは StrategyRow / RelatedStrategyCard / strategies/[...slug] /
 * lib/og-image / concerns/index に逐語コピーされていた。同じ判断が 5 箇所に
 * あると、片方だけ直った時に誰も気づけない。実際、og-image だけ負の効果量の赤が
 * `#dc2626` で、サイトの `--color-chart-red`(`#c0392b`)とずれていた。
 */

/** 効果量の向き。色・記号・バーの向きは、すべてこの 1 つの判断から導く。 */
export type EffectTone = "positive" | "neutral" | "negative";

export function effectTone(monthsGained: number): EffectTone {
  if (monthsGained > 0) return "positive";
  if (monthsGained < 0) return "negative";
  return "neutral";
}

/** 効果量の符号表示。0 は「±」。 */
export function effectSign(monthsGained: number): string {
  const tone = effectTone(monthsGained);
  return tone === "positive" ? "+" : tone === "neutral" ? "±" : "";
}

/** エビデンス強度の ★ 表示(5 段階)。 */
export function stars(evidenceStrength: number): string {
  return "★".repeat(evidenceStrength) + "☆".repeat(5 - evidenceStrength);
}

/** 効果量の色(Tailwind ユーティリティ)。 */
const TONE_CLASS: Record<EffectTone, string> = {
  positive: "text-accent",
  neutral: "text-sub",
  negative: "text-chart-red",
};

export function effectColorClass(monthsGained: number): string {
  return TONE_CLASS[effectTone(monthsGained)];
}

/**
 * 効果量の色(実値)。OG 画像は Satori で描くのでクラス名を使えない。
 *
 * light の値を global.css から引く。ここに書き写すと、これまでと同じように
 * サイトとずれる。OG 画像にテーマの概念は無いため light 固定。
 */
const TONE_TOKEN: Record<EffectTone, string> = {
  positive: "--color-accent",
  neutral: "--color-sub",
  negative: "--color-chart-red",
};

function lightValue(token: string): string {
  // dark ブロックを読まないよう、@theme の中だけを見る。コメントは先に落とす
  // (日本語コメント中の「@theme」に正規表現がマッチする事故が実際にあった)。
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of source.matchAll(/@theme[^{]*\{([^}]*)\}/g)) {
    const m = block[1].match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
    if (m) return m[1].trim();
  }
  throw new Error(`global.css の @theme に ${token} が無い`);
}

export function effectColorHex(monthsGained: number): string {
  return lightValue(TONE_TOKEN[effectTone(monthsGained)]);
}

/**
 * 効果量バーの幅と向き。9 ヶ月で振り切る。
 * 上限は EEF の Toolkit が示す月数の実用上の上限に合わせている。
 */
const EFFECT_BAR_MAX = 9;

export function effectBar(monthsGained: number): {
  pct: number;
  sign: EffectTone;
} {
  return {
    pct:
      (Math.min(Math.abs(monthsGained), EFFECT_BAR_MAX) / EFFECT_BAR_MAX) * 100,
    sign: effectTone(monthsGained),
  };
}
