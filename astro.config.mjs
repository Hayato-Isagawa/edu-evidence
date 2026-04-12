// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import { remarkGlossary } from "./src/plugins/remark-glossary.mjs";

export default defineConfig({
  site: "https://edu-evidence.org",
  integrations: [react(), sitemap()],
  markdown: {
    remarkPlugins: [remarkGlossary],
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
