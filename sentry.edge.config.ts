// Sentry edge runtime initialisation (middleware, edge routes).
// Loaded via `instrumentation.ts` register() when NEXT_RUNTIME === "edge".
import * as Sentry from "@sentry/nextjs";
import { isExpectedUserError } from "@/lib/observability/expected-errors";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  enabled: Boolean(process.env.SENTRY_DSN),

  // Erwartete User-Validierungs-Throws nicht als Issue erfassen (s. server-config).
  beforeSend(event, hint) {
    const exc = hint?.originalException;
    const msg =
      exc instanceof Error ? exc.message : event.exception?.values?.[0]?.value;
    if (isExpectedUserError(msg)) return null;
    return event;
  }
});
