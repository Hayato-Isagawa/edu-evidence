import { test, expect } from "@playwright/test";

test.describe("コラム", () => {
  test("テーブルにスタイルが当たっている", async ({ page }) => {
    await page.goto("/columns/class-size-cost-effectiveness/");
    const table = page.locator(".prose-article table");
    await expect(table).toBeVisible();
    const thead = page.locator(".prose-article thead");
    const bg = await thead.evaluate(
      (el) => window.getComputedStyle(el).backgroundColor
    );
    // 背景色が transparent ではないこと(= スタイルが当たっている)
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("出典表記を参照日つきでコピーできる", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/columns/class-size-cost-effectiveness/");
    const button = page.getByRole("button", {
      name: "出典表記をコピー(参照日つき)",
    });
    await button.click();
    await expect(page.getByRole("status")).toHaveText("コピーしました");
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Tokyo",
    }).format(new Date());
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    // コラムは EEF の翻案ではないので帰属は CC BY-SA 4.0 だけ
    expect(copied).toMatch(
      new RegExp(
        `^「少人数学級にどれだけの効果があるか\\? — 費用対効果で見る「人数」と「指導」」EduEvidence JP\\(CC BY-SA 4\\.0\\)。` +
          `https://edu-evidence\\.org/columns/class-size-cost-effectiveness/ \\(公開 \\d{4}-\\d{2}-\\d{2}、出典の最終確認 \\d{4}-\\d{2}-\\d{2}、参照 ${today}\\)$`
      )
    );
  });
});
