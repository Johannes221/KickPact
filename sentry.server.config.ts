// Sentry server runtime initialisation (Node.js + Inngest).
// Loaded via `instrumentation.ts` register() when NEXT_RUNTIME === "nodejs".
import * as Sentry from "@sentry/nextjs";
import { isExpectedUserError } from "@/lib/observability/expected-errors";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  // Performance: 10 % der Transactions sampeln in prod, alles in dev.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Trennt Production/Preview/Dev in Sentry-UI.
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Filter: kein Logging wenn DSN fehlt (z. B. lokale Dev ohne .env).
  enabled: Boolean(process.env.SENTRY_DSN),

  // Erwartete User-Validierungs-Throws (Server-Actions) NICHT als Issue
  // erfassen — sie landen beim Nutzer als Toast, sind keine Bugs (Rauschen).
  beforeSend(event, hint) {
    const exc = hint?.originalException;
    const msg =
      exc instanceof Error ? exc.message : event.exception?.values?.[0]?.value;
    if (isExpectedUserError(msg)) return null;
    return event;
  },

  // Hilft beim Triagieren: zeigt Source-Files, nicht nur compiled chunks.
  debug: false,
});
