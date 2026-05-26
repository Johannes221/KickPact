// Sentry server runtime initialisation (Node.js + Inngest).
// Loaded via `instrumentation.ts` register() when NEXT_RUNTIME === "nodejs".
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Performance: 10 % der Transactions sampeln in prod, alles in dev.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Trennt Production/Preview/Dev in Sentry-UI.
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Filter: kein Logging wenn DSN fehlt (z. B. lokale Dev ohne .env).
  enabled: Boolean(process.env.SENTRY_DSN),

  // Hilft beim Triagieren: zeigt Source-Files, nicht nur compiled chunks.
  debug: false,
});
