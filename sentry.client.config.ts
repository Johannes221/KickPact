// Sentry client (browser) initialisation.
// Geladen durch withSentryConfig() automatisch im _app/Layout-Bundle.
//
// HINWEIS: Ab Next.js 15.3 wird dies durch `instrumentation-client.ts` ersetzt.
// KickPact ist auf 15.0.3 → noch sentry.client.config.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session-Replay nur in prod, 10 % aller Sessions + 100 % bei Errors.
  // Spart Quota auf dem Free-Tier.
  replaysSessionSampleRate:
    process.env.NODE_ENV === "production" ? 0.1 : 0,
  replaysOnErrorSampleRate: 1.0,

  environment:
    process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
});
