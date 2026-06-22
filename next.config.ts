import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const config: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "localhost:3003"],
      // Verifizierungs-Uploads erlauben Dokumente bis 10 MB (submit-verification.ts).
      // Next.js drosselt Server-Action-Bodies per Default auf 1 MB → Uploads
      // zwischen 1–10 MB warfen "Body exceeded 1 MB limit", BEVOR die Action
      // (inkl. eigener 10-MB-Prüfung + freundlicher Fehlermeldung) lief.
      // 12 MB = 10 MB Datei + Headroom für Multipart-/Feld-Overhead.
      bodySizeLimit: "12mb"
    }
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
  },
  // SECURITY (H3): HTTP-Security-Header. Es gibt keine middleware.ts, daher
  // werden die Header global hier gesetzt. Schützt gegen Clickjacking,
  // MIME-Sniffing, Protokoll-Downgrade und referrer-Leaks; CSP als
  // Defense-in-depth zu dem (aktuell repo-internen) dangerouslySetInnerHTML
  // im Help-Center.
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    // CSP: Next braucht 'unsafe-inline' (und in dev 'unsafe-eval') für Styles/
    // Hydration. Erlaubte Fremd-Origins: Plausible (Analytics), Sentry
    // (ingest), R2/Unsplash (Bilder). In dev keine HSTS/strenge CSP, damit
    // HMR & localhost-http nicht brechen.
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://analytics.schartl.dev`,
      // Web-Worker aus Blobs (z.B. Bild-/WASM-Verarbeitung) erlauben — sonst
      // greift script-src als Fallback und blockt blob:-Worker (CSP-Konsolen-
      // Fehler + stilles Feature-Brechen).
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://analytics.schartl.dev https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'"
    ].join("; ");

    const securityHeaders = [
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()"
      },
      { key: "Content-Security-Policy", value: csp }
    ];
    if (isProd) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload"
      });
    }
    return [{ source: "/:path*", headers: securityHeaders }];
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
