import Script from "next/script";

/**
 * Plausible Analytics — GDPR-konformes, cookiefreies Webanalyse-Script.
 *
 * Rendert NUR in Production und nur wenn `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` gesetzt
 * ist. Im Dev-Server und in den E2E-Tests bleibt das Snippet außen vor, damit
 * lokale Klicks die Production-Statistik nicht verfälschen.
 *
 * Self-Hosting (später): URL via `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC` überschreibbar,
 * z.B. `https://analytics.kickpact.de/js/script.js`. Default ist die offizielle
 * Hosted-Version.
 *
 * Doku: https://plausible.io/docs/script-extensions
 */
export function PlausibleScript() {
  if (process.env.NODE_ENV !== "production") return null;

  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return null;

  const scriptSrc =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC ?? "https://plausible.io/js/script.js";

  return (
    <Script
      id="plausible-analytics"
      strategy="afterInteractive"
      src={scriptSrc}
      data-domain={domain}
      defer
    />
  );
}
