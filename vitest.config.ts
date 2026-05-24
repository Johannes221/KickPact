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
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
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
