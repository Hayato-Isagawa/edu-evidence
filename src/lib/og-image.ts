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

const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";
const FALLBACK_FONT_URL =
  "https://cdn.jsdelivr.net/gh/nicehash/Noto-Sans-JP@main/fonts/NotoSansJP-Bold.otf";

// Astro のバンドル後もソース位置と無関係にプロジェクトルートへ解決できるよう
// process.cwd() を基準にする(build は常にリポジトリルートから実行される前提)
const FONT_CACHE_DIR = path.resolve(process.cwd(), "scripts", "fonts");
const FONT_CACHE_PATH = path.join(FONT_CACHE_DIR, "noto-sans-jp-bold.bin");

let inProcessFontData: ArrayBuffer | null = null;

async function fetchFromGoogleFonts(): Promise<ArrayBuffer> {
  const cssRes = await fetch(FONT_CSS_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
  });
  const css = await cssRes.text();
  const match = css.match(/src:\s*url\(([^)]+)\)/);
  if (!match) throw new Error("Font URL not found in Google Fonts CSS");
  const fontRes = await fetch(match[1]);
  return await fontRes.arrayBuffer();
}

async function loadFontFromDisk(): Promise<ArrayBuffer | null> {
  try {
    const buf = await fs.readFile(FONT_CACHE_PATH);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
}

async function writeFontToDisk(data: ArrayBuffer): Promise<void> {
  try {
    await fs.mkdir(FONT_CACHE_DIR, { recursive: true });
    await fs.writeFile(FONT_CACHE_PATH, Buffer.from(data));
  } catch {
    // キャッシュ書き込みに失敗してもレンダリング自体は続行
  }
}

async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
  if (inProcessFontData) return inProcessFontData;

  const fromDisk = await loadFontFromDisk();
  if (fromDisk) {
    inProcessFontData = fromDisk;
    return fromDisk;
  }

  try {
    const fresh = await fetchFromGoogleFonts();
    inProcessFontData = fresh;
    await writeFontToDisk(fresh);
    return fresh;
  } catch {
    const fallbackRes = await fetch(FALLBACK_FONT_URL);
    const fallback = await fallbackRes.arrayBuffer();
    inProcessFontData = fallback;
    await writeFontToDisk(fallback);
    return fallback;
  }
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
