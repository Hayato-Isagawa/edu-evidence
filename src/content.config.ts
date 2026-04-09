import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const strategies = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/strategies" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    monthsGained: z.number().min(-12).max(12),
    evidenceStrength: z.number().min(1).max(5),
    cost: z.number().min(1).max(5),
    subjects: z.array(z.string()).default(["全教科"]),
    grades: z.array(z.string()).default(["全学年"]),
    tags: z.array(z.string()).default([]),
    source: z.enum(["eef", "japan"]).default("eef"),
    sourceUrl: z.string().url().optional(),
    sourceTitle: z.string().optional(),
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
