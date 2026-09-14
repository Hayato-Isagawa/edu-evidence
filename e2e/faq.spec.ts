import { test, expect } from "@playwright/test";

test.describe("FAQ の構造化データ", () => {
  test("FAQPage の JSON-LD が、表示している Q&A と同じ数の Question を持つ", async ({ page }) => {
    await page.goto("/faq/");
    const scripts = await page
      .locator('script[type="application/ld+json"]')
      .evaluateAll((els) => els.map((el) => JSON.parse(el.textContent ?? "null")));
    const faq = scripts.find((s) => s?.["@type"] === "FAQPage");
    expect(faq, "FAQPage の JSON-LD が無い").toBeTruthy();
    const visible = await page.locator("main h3").count();
    expect(faq.mainEntity).toHaveLength(visible);
    for (const q of faq.mainEntity) {
      expect(q["@type"]).toBe("Question");
      expect(q.name.length).toBeGreaterThan(0);
      expect(q.acceptedAnswer["@type"]).toBe("Answer");
      expect(q.acceptedAnswer.text.length).toBeGreaterThan(0);
    }
  });
});
