import { test, expect } from "@playwright/test";

const pages = [
  { name: "home", path: "/" },
  { name: "columns-index", path: "/columns" },
  { name: "column-detail", path: "/columns/active-deep-learning-evidence" },
  { name: "strategy-detail", path: "/strategies/ai-in-education" },
  { name: "seasonal-july", path: "/seasonal/july" },
  { name: "subjects-index", path: "/subjects" },
  { name: "concerns-index", path: "/concerns" },
  { name: "guide-index", path: "/guide" },
  { name: "glossary", path: "/guide/glossary" },
  { name: "about", path: "/about" },
  { name: "faq", path: "/faq" },
  { name: "voices", path: "/voices" },
  { name: "policy-evidence", path: "/policy-evidence" },
  { name: "changelog", path: "/changelog" },
  { name: "search", path: "/search" },
  { name: "not-found", path: "/404" },
];

for (const p of pages) {
  test(p.name, async ({ page }) => {
    await page.goto(p.path, { waitUntil: "networkidle" });
    await expect(page).toHaveScreenshot(`${p.name}.png`, { fullPage: true });
  });
}
