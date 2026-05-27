import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const config: NextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000", "localhost:3003"] }
  },
  // Help-Center liest Markdown via fs.readdir aus docs/help-center/articles/.
  // Auf Coolify/Vercel-Builds wird das docs/-Dir NICHT automatisch in den
  // Server-Bundle gepackt → Runtime-500 mit ENOENT. outputFileTracingIncludes
  // explizit hinzufügen damit der Build die Markdown-Files mit ausliefert.
  outputFileTracingIncludes: {
    "/hilfe": ["./docs/help-center/articles/**/*.md"],
    "/hilfe/**/*": ["./docs/help-center/articles/**/*.md"]
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**"
      }
    ]
  }
};

// Sentry-Wrapper: source-map upload + auto-instrumentation für Server Actions.
// Org/Project lesen wir aus env, damit Forks/local-dev nicht versuchen Maps
// hochzuladen. Wenn SENTRY_AUTH_TOKEN fehlt → source-map upload silently skip.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG ?? "kickpact",
  project: process.env.SENTRY_PROJECT ?? "kickpact",
  silent: !process.env.CI,

  // Source-Maps werden nur in prod-builds erzeugt + hochgeladen.
  widenClientFileUpload: true,

  // Source-Maps nach Upload lokal löschen → kein public-Leak in .next/static.
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"]
  },

  // Tree-shake Sentry-Logger in Client-Bundles (~10 KB Ersparnis).
  // Hinweis: disableLogger + automaticVercelMonitors sind in @sentry/nextjs 9+
  // deprecated — Effekt bleibt identisch, Warnings verschwinden nach Entfernung.

  // Automatic Vercel-Cron-Monitoring deaktiviert (KickPact nutzt Inngest).
  // automaticVercelMonitors: false — deprecated, Default ist bereits false ohne Vercel-Env.
});
