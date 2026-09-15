import { test, expect } from "@playwright/test";

test.describe("戦略詳細ページ", () => {
  test("メタ認知ページが表示される", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    await expect(page.locator("h1")).toContainText("メタ認知");
  });

  test("出典別エビデンスセクションが表示される", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    await expect(page.getByText("出典別のエビデンス")).toBeVisible();
  });

  test("culturalContext が表示される", async ({ page }) => {
    await page.goto("/strategies/metacognition/");
    await expect(page.getByText("日本の文脈で考慮したいこと")).toBeVisible();
  });

  test("出典表記を参照日つきでコピーできる", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/strategies/metacognition/");
    const button = page.getByRole("button", {
      name: "出典表記をコピー(参照日つき)",
    });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByRole("status")).toHaveText("コピーしました");
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
    }).format(new Date());
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(
      new RegExp(
        `^「メタ認知の指導」EduEvidence JP\\(CC BY-SA 4\\.0、英国 EEF Teaching and Learning Toolkit を翻案\\)。` +
          `https://edu-evidence\\.org/strategies/metacognition/ \\(出典の最終確認 \\d{4}-\\d{2}-\\d{2}、参照 ${today}\\)$`
      )
    );
    await expect(button).toHaveAttribute("data-copy", "done");
  });
});
