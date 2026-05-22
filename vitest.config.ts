import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["tests/setup/global.ts"],
    include: ["tests/**/*.test.ts"],
    // Integration tests against a real Postgres can be slow on cold start
    // (migrations + truncate). 30s is generous for the heaviest seed paths.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      reporter: ["text", "html"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/db/schema/**", "lib/inngest/client.ts"]
    }
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") }
  }
});
