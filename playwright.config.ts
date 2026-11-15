import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npx serve dist -l 4173",
    port: 4173,
    // 同じポートに別の作業ツリーや別セッションのサーバーが残っていると、それを使って
    // 別のビルドを検査してしまう。使わずに、起動の時点で止める。
    reuseExistingServer: false,
  },
});
