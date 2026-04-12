import satori from "satori";
import sharp from "sharp";

interface OgParams {
  title: string;
  monthsGained: number;
  evidenceStrength: number;
  subjects: string[];
}

export async function generateOgImage(params: OgParams): Promise<Buffer> {
  const { title, monthsGained, evidenceStrength, subjects } = params;

  const effectSign = monthsGained > 0 ? "+" : monthsGained === 0 ? "±" : "";
  const effectColor = monthsGained > 0 ? "#2b5d3a" : monthsGained === 0 ? "#6b6b66" : "#dc2626";
  const stars = "★".repeat(evidenceStrength) + "☆".repeat(5 - evidenceStrength);

  // Noto Sans JP を fetch してフォントデータとして使用
  const fontUrl = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700;900&display=swap";
  let fontData: ArrayBuffer;

  try {
    // Google Fonts から CSS を取得し、フォント URL を抽出
    const cssRes = await fetch(fontUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" },
    });
    const css = await cssRes.text();
    const match = css.match(/src:\s*url\(([^)]+)\)/);
    if (match) {
      const fontRes = await fetch(match[1]);
      fontData = await fontRes.arrayBuffer();
    } else {
      throw new Error("Font URL not found");
    }
  } catch {
    // フォールバック: システムフォント相当のダミー
    const fallbackRes = await fetch(
      "https://cdn.jsdelivr.net/gh/nicehash/Noto-Sans-JP@main/fonts/NotoSansJP-Bold.otf"
    );
    fontData = await fallbackRes.arrayBuffer();
  }

  const svg = await satori(
    {
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
    },
    {
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
    }
  );

  return await sharp(Buffer.from(svg)).png().toBuffer();
}
