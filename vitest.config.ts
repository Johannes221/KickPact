import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  test: {
    globals: true,
    environment: "node",
    globalSetup: ["tests/setup/global.ts"],
    // Pro-Datei-Teardown: schließt am Dateiende beide DB-Pools, damit keine
    // verspätete/zombie DB-Query in die nächste Datei blutet (Flake-Wurzel).
    setupFiles: ["tests/setup/db-teardown.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
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
    alias: {
      "@": path.resolve(__dirname, "."),
      // Next.js `server-only` ist in der Test-Runtime nicht verfügbar — Stub.
      "server-only": path.resolve(__dirname, "tests/setup/server-only-stub.ts")
    }
  }
});
