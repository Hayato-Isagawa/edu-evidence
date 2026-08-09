import { defineConfig } from "@playwright/test";

const dist = process.env.VRT_DIST ?? "dist";

export default defineConfig({
  testDir: "./vrt",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // リトライしない。同一ビルド同士の撮り比べで差分が 0 になることを実測して
  // いる(閾値 0 で 30 件全通過 × 2 回)ので、落ちたのは基本的に本物である。
  // リトライを入れると、間欠的に出る問題を握り潰す。
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  snapshotPathTemplate: "vrt/__screenshots__/{projectName}/{arg}{ext}",
  expect: {
    timeout: 30000,
    toHaveScreenshot: {
      // 0.01(1%)は全画面撮影に対して緩すぎた。h2 の letter-spacing を
      // 0.06em 変える実験(portfolio で実施)では、ページ高が変わらないページの
      // 差分比は 0.01 前後にしかならず、36 件中 34 件が通ってしまう。
      // ノイズ側は実測 0 なので、その間に置く。
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
    },
  },
  use: {
    baseURL: "http://localhost:4173",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    // serve は devDependencies に入れてある。入れずに npx で呼ぶと CI が
    // 実行のたびに npm から最新版を取ってきて走らせることになる。
    command: `npx serve ${dist} -l 4173`,
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
