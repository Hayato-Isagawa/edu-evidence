import satori from "satori";
import type { ReactNode } from "react";
import sharp from "sharp";
import { promises as fs } from "node:fs";
import path from "node:path";

interface SiteOgConfig {
  siteNameMain: string;
  siteNameAccent: string;
  headlineLines: string[];
  sub: string;
  domainLabel: string;
  accentColor: string;
}

const config: SiteOgConfig = {
  siteNameMain: "EduEvidence",
  siteNameAccent: "JP",
  headlineLines: ["エビデンスを、", "現場の指導へ。"],
  sub: "経験と勘に、もうひとつの視点を。",
  domainLabel: "edu-evidence.org",
  accentColor: "#2b5d3a",
};

// サイトヘッダーと同じブランド行を再現するための葉ロゴ
// (Logo.astro と同ジオメトリ、色はアクセント固定・葉脈は OG 背景色)
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="${config.accentColor}">
  <path d="M60 10 C25 28, 15 58, 22 88 C30 78, 42 68, 60 62 C78 68, 90 78, 98 88 C105 58, 95 28, 60 10Z" />
  <line x1="60" y1="14" x2="60" y2="78" stroke="#faf9f5" stroke-width="2.5" stroke-linecap="round" />
  <line x1="60" y1="32" x2="36" y2="48" stroke="#faf9f5" stroke-width="2" stroke-linecap="round" />
  <line x1="60" y1="52" x2="30" y2="66" stroke="#faf9f5" stroke-width="2" stroke-linecap="round" />
  <line x1="60" y1="70" x2="38" y2="80" stroke="#faf9f5" stroke-width="2" stroke-linecap="round" />
  <line x1="60" y1="32" x2="84" y2="48" stroke="#faf9f5" stroke-width="2" stroke-linecap="round" />
  <line x1="60" y1="52" x2="90" y2="66" stroke="#faf9f5" stroke-width="2" stroke-linecap="round" />
  <line x1="60" y1="70" x2="82" y2="80" stroke="#faf9f5" stroke-width="2" stroke-linecap="round" />
  <line x1="60" y1="78" x2="60" y2="112" stroke="${config.accentColor}" stroke-width="3" stroke-linecap="round" />
</svg>`;
const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;

const FONT_PATH = path.resolve(
  process.cwd(),
  "scripts",
  "fonts",
  "noto-sans-jp-bold.bin",
);

async function loadNotoSansJpFont(): Promise<ArrayBuffer> {
  const buf = await fs.readFile(FONT_PATH);
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength,
  ) as ArrayBuffer;
}

async function buildDefaultOg(): Promise<Buffer> {
  const fontData = await loadNotoSansJpFont();

  const headlineParts: Array<Record<string, unknown>> = [];
  config.headlineLines.forEach((line, i) => {
    headlineParts.push({
      type: "div",
      props: {
        style: {
          fontSize: "84px",
          fontWeight: 900,
          color: "#1a1a1a",
          lineHeight: 1.18,
          letterSpacing: "-0.01em",
        },
        children: line,
      },
      key: `line-${i}`,
    });
  });

  const element = {
    type: "div",
    props: {
      style: {
        width: "1200px",
        height: "630px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "#faf9f5",
        fontFamily: "Noto Sans JP",
        position: "relative",
      },
      children: [
        {
          type: "div",
          props: {
            style: {
              position: "absolute",
              left: "0",
              top: "0",
              width: "8px",
              height: "100%",
              background: config.accentColor,
            },
          },
        },
        {
          type: "div",
          props: {
            style: {
              display: "flex",
              flexDirection: "column",
              gap: "28px",
            },
            children: [
              {
                type: "div",
                props: {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                  },
                  children: [
                    {
                      type: "img",
                      props: {
                        src: logoDataUri,
                        width: 64,
                        height: 64,
                      },
                    },
                    {
                      type: "div",
                      props: {
                        style: {
                          display: "flex",
                          fontSize: "46px",
                          fontWeight: 900,
                          letterSpacing: "-0.01em",
                        },
                        children: [
                          {
                            type: "span",
                            props: {
                              style: {
                                color: "#1a1a1a",
                                marginRight: "12px",
                              },
                              children: config.siteNameMain,
                            },
                          },
                          {
                            type: "span",
                            props: {
                              style: { color: config.accentColor },
                              children: config.siteNameAccent,
                            },
                          },
                        ],
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
                    flexDirection: "column",
                  },
                  children: headlineParts,
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
                    fontSize: "26px",
                    color: "#3a3a36",
                    fontWeight: 700,
                  },
                  children: config.sub,
                },
              },
              {
                type: "div",
                props: {
                  style: {
                    fontSize: "18px",
                    color: "#6b6b66",
                    letterSpacing: "0.02em",
                  },
                  children: config.domainLabel,
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

async function main(): Promise<void> {
  const outPath = path.resolve(process.cwd(), "public", "og-image.png");
  const buf = await buildDefaultOg();
  await fs.writeFile(outPath, buf);
  process.stdout.write(`generated: ${outPath} (${buf.byteLength} bytes)\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`failed to generate default OG: ${String(err)}\n`);
  process.exit(1);
});
