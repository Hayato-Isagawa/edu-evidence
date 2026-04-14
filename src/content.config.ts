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
  }),
});

const columns = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/columns" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    date: z.string(),
    tags: z.array(z.string()).default([]),
    relatedStrategies: z.array(z.string()).default([]),
  }),
});

export const collections = { strategies, columns };
