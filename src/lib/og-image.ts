import satori from "satori";
import type { ReactNode } from "react";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

interface OgParams {
  title: string;
  monthsGained: number;
  evidenceStrength: number;
  subjects: string[];
}

// build 時にリポジトリ同梱のフォントを読み込む。
// ADR 0017 で Google Fonts / jsDelivr への build-time 依存を排除し、
// `scripts/fonts/noto-sans-jp-bold.bin` を git 管理対象として同梱する方針に変更。
const FONT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "fonts",
  "noto-sans-jp-bold.bin",
);

let inProcessFontData: ArrayBuffer | null = null;

async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
  if (inProcessFontData) return inProcessFontData;

  const buf = await fs.readFile(FONT_PATH);
  const data = buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
  inProcessFontData = data;
  return data;
}

export async function generateOgImage(params: OgParams): Promise<Buffer> {
  const { title, monthsGained, evidenceStrength, subjects } = params;

  const effectSign = monthsGained > 0 ? "+" : monthsGained === 0 ? "±" : "";
  const effectColor = monthsGained > 0 ? "#2b5d3a" : monthsGained === 0 ? "#6b6b66" : "#dc2626";
  const stars = "★".repeat(evidenceStrength) + "☆".repeat(5 - evidenceStrength);

  const fontData = await loadNotoSansJpFont();

  const element = {
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
                            fontSize: "72px",
                            fontWeight: 900,
                            color: effectColor,
                          },
                          children: `${effectSign}${monthsGained}`,
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { fontSize: "24px", color: effectColor },
                          children: "ヶ月",
                        },
                      },
                      {
                        type: "div",
                        props: {
                          style: { fontSize: "28px", color: "#d97706", marginLeft: "24px" },
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
