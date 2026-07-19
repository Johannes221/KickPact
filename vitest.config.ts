import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  test: {
    globals: true,
    environment: "node",
    // Feste, von UTC ABWEICHENDE Zeitzone für alle Läufe.
    //
    // Die UTC-Grenzfall-Tests (Monatsfenster, Saison-Fenster, Rechnungs-
    // Perioden) können unter TZ=UTC per Konstruktion nicht fehlschlagen: dort
    // ist `new Date(2026,1,1)` identisch zu `Date.UTC(2026,1,1)`, ein lokaler
    // Date-Konstruktor im Produktivcode fällt also nicht auf. Genau so lief es
    // in CI (ubuntu-latest = UTC) — die Tests waren dort wirkungslos, während
    // sie lokal (Europe/Berlin) griffen.
    //
    // New York statt Berlin: eine Zone HINTER UTC verschiebt die Monatsgrenze
    // in die andere Richtung und fängt damit die Fehlerklasse, die eine Zone
    // vor UTC durchrutschen lässt.
    env: { TZ: "America/New_York" },
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
