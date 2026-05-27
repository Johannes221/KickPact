import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import path from "node:path";

// Lade .env.local in den Test-Runner-Process, damit E2E_TEST_BYPASS_KEY +
// PLAYWRIGHT_BASE_URL ohne separates Setup-Skript funktionieren.
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://kickpact.schartl.dev",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  // Kein webServer hier — Tests laufen gegen laufende App (lokal oder Staging).
  // Für CI: PLAYWRIGHT_BASE_URL setzen. Für local-dev: PLAYWRIGHT_BASE_URL=http://localhost:3000
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
});
