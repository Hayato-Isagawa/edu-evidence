// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import rehypeExternalLinks from "rehype-external-links";
import { remarkGlossary } from "./src/plugins/remark-glossary.mjs";
import { remarkStrategyRef } from "./src/plugins/remark-strategy-ref.mjs";
import { remarkChart } from "./src/plugins/remark-chart.mjs";

export default defineConfig({
  site: "https://edu-evidence.org",
  integrations: [react(), sitemap()],
  markdown: {
    // 順序重要: chart → strategy-ref → glossary
    //   - chart はプレースホルダー段落を HTML に変換(先に SVG 化)
    //   - strategy-ref は戦略参照を展開
    //   - glossary は用語ツールチップを付与(最後)
    remarkPlugins: [remarkChart, remarkStrategyRef, remarkGlossary],
    // 外部リンクを別タブで開き、tab-napping 攻撃を防ぐ rel 属性を付与
    rehypePlugins: [
      [
        rehypeExternalLinks,
        {
          target: "_blank",
          rel: ["noopener", "noreferrer"],
        },
      ],
    ],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
