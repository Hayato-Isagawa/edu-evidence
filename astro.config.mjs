// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import rehypeExternalLinks from "rehype-external-links";
import { remarkGlossary } from "./src/plugins/remark-glossary.mjs";
import { remarkStrategyRef } from "./src/plugins/remark-strategy-ref.mjs";

export default defineConfig({
  site: "https://edu-evidence.org",
  integrations: [react(), sitemap()],
  markdown: {
    // 順序重要: strategy-ref → glossary(先に戦略参照を展開してから用語を処理)
    remarkPlugins: [remarkStrategyRef, remarkGlossary],
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
