// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://edu-evidence.jp",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
