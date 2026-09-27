import satori from "satori";
import type { ReactNode } from "react";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  stars as toStars,
  effectSign as toEffectSign,
  UNMEASURED_LABEL,
  effectColorHex,
} from "./effect-size";
import { tokenHex } from "./css-color";

// ★ の色。サイト本文は --color-rating を使っているが、ここは長く #d97706 が
// 書かれていた。Tailwind が palette を oklch に移した際の取り残しで、
// 実際の値は #e17100。OG 画像だけ別の橙になっていた。
const ratingColor = tokenHex("--color-rating");

export type OgParams = {
  title: string;
  monthsGained: number;
  monthsUnmeasured?: boolean;
  evidenceStrength: number;
  subjects: string[];
};

// build 時にリポジトリ同梱のフォントを読み込む。
// ADR 0017 で Google Fonts / jsDelivr への build-time 依存を排除し、
// `scripts/fonts/noto-sans-jp-bold.bin` を git 管理対象として同梱する方針に変更。
const FONT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "fonts",
  "noto-sans-jp-bold.bin"
);

let inProcessFontData: ArrayBuffer | null = null;

async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
  if (inProcessFontData) return inProcessFontData;

  const buf = await fs.readFile(FONT_PATH);
  const data = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer;
  inProcessFontData = data;
  return data;
}

/**
 * OG 画像に描く値。画像(og/[...slug].png.ts)と `?v=`(strategies/[...slug].astro)の
 * 両方がこれを通すので、描く値と版の元になる値の集合がずれない
 */
export function ogParamsOf(data: OgParams): OgParams {
  return {
    title: data.title,
    monthsGained: data.monthsGained,
    monthsUnmeasured: data.monthsUnmeasured,
    evidenceStrength: data.evidenceStrength,
    subjects: data.subjects,
  };
}

/** satori に渡す要素ツリー。色はトークンから解決済みの値が入る */
export function buildOgElement(params: OgParams) {
  const {
    title,
    monthsGained,
    monthsUnmeasured = false,
    evidenceStrength,
    subjects,
  } = params;

  const effectSign = toEffectSign(monthsGained);
  const effectColor = effectColorHex(monthsGained);
  const stars = toStars(evidenceStrength);

  return {
    type: "div",
    props: {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 70px",
        background: "#faf9f5",
        fontFamily: "Noto Sans JP",
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: "16px" },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "14px",
                    letterSpacing: "0.15em",
                    color: "#2b5d3a",
                    textTransform: "uppercase",
                  },
                  children: "EduEvidence JP — Strategy",
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: title.length > 15 ? "48px" : "56px",
                    fontWeight: 900,
                    color: "#1a1a1a",
                    lineHeight: 1.2,
                  },
                  children: title,
                },
              },
              {
                type: "div",
                props: {
                  style: { fontSize: "16px", color: "#6b6b66" },
                  children: subjects.join(" · "),
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "baseline",
                    gap: "12px",
                  },
                  children: [
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: monthsUnmeasured ? "44px" : "72px",
                          fontWeight: 900,
                          color: effectColor,
                        },
                        children: monthsUnmeasured
                          ? UNMEASURED_LABEL
                          : `${effectSign}${monthsGained}`,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: { fontSize: "24px", color: effectColor },
                        children: monthsUnmeasured ? "" : "ヶ月",
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          fontSize: "28px",
                          color: ratingColor,
                          marginLeft: "24px",
                        },
                        children: stars,
                      },
                    },
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "16px",
                    color: "#6b6b66",
                  },
                  children: "edu-evidence.org",
                },
              },
            ],
          },
        },
      ],
    },
  };
}

/**
 * OG 画像の `?v=`(ADR 0041)。描く要素ツリーのハッシュなので、値・レイアウト・色の
 * どれが変わっても変わる。フォントファイルと satori の版だけの変更では変わらない
 */
export function ogVersion(params: OgParams): string {
  return createHash("sha256")
    .update(JSON.stringify(buildOgElement(params)))
    .digest("hex")
    .slice(0, 8);
}

export async function generateOgImage(params: OgParams): Promise<Buffer> {
  const element = buildOgElement(params);
  const fontData = await loadNotoSansJpFont();

  const svg = await satori(element as unknown as ReactNode, {
    width: 1200,
    height: 630,
    fonts: [
      {
        name: "Noto Sans JP",
        data: fontData,
        weight: 700,
        style: "normal" as const,
      },
    ],
  });

  return await sharp(Buffer.from(svg)).png().toBuffer();
}
