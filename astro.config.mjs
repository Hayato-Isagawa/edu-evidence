// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { remarkGlossary } from "./src/plugins/remark-glossary.mjs";
import { remarkStrategyRef } from "./src/plugins/remark-strategy-ref.mjs";

export default defineConfig({
  site: "https://edu-evidence.org",
  integrations: [react(), sitemap()],
  markdown: {
    // 順序重要: strategy-ref → glossary(先に戦略参照を展開してから用語を処理)
    remarkPlugins: [remarkStrategyRef, remarkGlossary],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
