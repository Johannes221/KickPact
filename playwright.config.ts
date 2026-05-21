import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  // Kein webServer hier — Tests müssen gegen laufende App laufen
  // Für CI: PLAYWRIGHT_BASE_URL setzen
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
});
