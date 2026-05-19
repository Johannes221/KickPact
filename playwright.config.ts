import { defineConfig } from "@playwright/test";

const runE2E = process.env.RUN_E2E === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60 * 1000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure"
  },
  // Only spin up the dev server when E2E tests are actually enabled
  webServer: runE2E
    ? {
        command: "npm run dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 180 * 1000
      }
    : undefined
});
