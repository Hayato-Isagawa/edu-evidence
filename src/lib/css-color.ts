// ?raw で CSS をそのまま文字列として取り込む。色の実値を持つのは global.css
// だけにするため(src/pages/design-tokens.json.ts と同じ方式)。
import css from "../styles/global.css?raw";

/**
 * global.css のトークンを、OG 画像で使える実値として取り出す。
 *
 * OG 画像は Satori + Sharp で描くのでクラス名を使えず、色を実値で渡す必要が
 * ある。ここに書き写すとサイトとずれるため、CSS から引く。
 *
 * `oklch()` はそのまま渡せない。Satori は色を SVG の fill にそのまま通し、
 * Sharp(resvg)が oklch を解さないため **黒く塗られる**(2026-08-04 に実測)。
 * sRGB に変換してから渡す。
 */

/** `@theme` の light 値を引く(dark は OG 画像に概念が無いので見ない)。 */
export function lightTokenValue(token: string): string {
  // コメントは先に落とす。日本語コメント中の「@theme」に正規表現がマッチし、
  // 別のブロックを拾う事故が実際に起きた。
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of source.matchAll(/@theme[^{]*\{([^}]*)\}/g)) {
    const m = block[1].match(new RegExp(`${token}\\s*:\\s*([^;]+);`));
    if (m) return m[1].trim();
  }
  throw new Error(`global.css の @theme に ${token} が無い`);
}

/**
 * Oklch を sRGB に変換する。係数は Björn Ottosson の公開値。
 * Chrome の実装と一致することを実測で確認している
 * (oklch(66.6% 0.179 58.318) → #e17100)。
 */
function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;
  const [L, M, S] = [lp ** 3, mp ** 3, sp ** 3];

  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];

  return (
    "#" +
    linear
      .map((v) => {
        const encoded =
          v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
        const byte = Math.max(0, Math.min(255, Math.round(encoded * 255)));
        return byte.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/** CSS の色表記を hex に揃える。hex はそのまま返す。 */
export function toHex(value: string): string {
  if (value.startsWith("#")) return value;

  const m = value.match(
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/
  );
  if (m) {
    const l = m[2] === "%" ? Number(m[1]) / 100 : Number(m[1]);
    return oklchToHex(l, Number(m[3]), Number(m[4]));
  }

  // 想定外の表記を黙って通すと、Satori 経由で黒く塗られて気づけない。
  throw new Error(`hex に変換できない色表記: ${value}`);
}

/** トークン名から OG 画像に渡せる hex を得る。 */
export function tokenHex(token: string): string {
  return toHex(lightTokenValue(token));
}
