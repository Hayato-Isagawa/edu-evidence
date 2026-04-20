import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const strategies = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/strategies" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    // プライマリ値: 読者に見せる代表値
    // 決定順序: 日本研究(★3以上) > EEF > Hattie(注記付き) > 0(未証明)
    monthsGained: z.number().min(-12).max(12),
    evidenceStrength: z.number().min(1).max(5),
    cost: z.number().min(1).max(5),
    subjects: z.array(z.string()).default(["全教科"]),
    grades: z.array(z.string()).default(["全学年"]),
    tags: z.array(z.string()).default([]),
    category: z
      .enum(["指導法", "制度・環境", "知っておくべき知見", "認知科学", "家庭・外部"])
      .default("指導法"),
    source: z.enum(["eef", "japan", "hattie", "mixed"]).default("eef"),
    sourceUrl: z.string().url().optional(),
    sourceTitle: z.string().optional(),

    // 出典別の詳細データ(併記用)
    evidence: z
      .object({
        eef: z
          .object({
            monthsGained: z.number().optional(),
            strength: z.number().min(1).max(5).optional(),
            note: z.string().optional(),
          })
          .optional(),
        japan: z
          .object({
            monthsGained: z.number().optional(),
            strength: z.number().min(1).max(5).optional(),
            note: z.string().optional(),
            researcher: z.string().optional(),
          })
          .optional(),
        hattie: z
          .object({
            cohensD: z.number().optional(),
            note: z.string().optional(),
          })
          .optional(),
      })
      .optional(),

    // 文化的注記: 日本文脈での効果の差異や注意点
    culturalContext: z.string().optional(),

    // 最終検証日: 一次ソースとの照合日
    lastVerified: z.string().optional(),

    // Technical Appendix: 計算根拠の構造化データ(オプション)
    // EEF 方式に倣い、戦略ページで「研究の詳細」セクションを表示
    methodology: z
      .object({
        studies: z.number().optional(),           // メタ分析に含まれる研究数
        sampleSize: z.string().optional(),        // 総サンプルサイズ(例: "10,500人")
        effectSize: z.string().optional(),        // 効果量(例: "d=0.37, 95%CI [0.30, 0.44]")
        primaryMetaAnalysis: z
          .object({
            authors: z.string(),                  // 著者(例: "Nickow, Oreopoulos & Quan")
            year: z.number(),                     // 発表年
            title: z.string(),                    // 論文タイトル
            url: z.string().url().optional(),     // DOI 等のリンク
          })
          .optional(),
        limitations: z.string().optional(),       // エビデンスの限界
      })
      .optional(),
  }),
});

const columns = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/columns" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.string(),
    // 最終検証日: 公開後に一次ソースや記述内容を再検証した最新日。未設定なら公開日=最終検証日と見なす
    lastVerified: z.string().optional(),
    tags: z.array(z.string()).default([]),
    relatedStrategies: z.array(z.string()).default([]),
  }),
});

export const collections = { strategies, columns };
