import Script from "next/script";

/**
 * Plausible Analytics — GDPR-konformes, cookiefreies Webanalyse-Script.
 *
 * Rendert NUR in Production und nur wenn `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` gesetzt
 * ist. Im Dev-Server und in den E2E-Tests bleibt das Snippet außen vor, damit
 * lokale Klicks die Production-Statistik nicht verfälschen.
 *
 * Self-Hosting: läuft auf der eigenen Plausible-Instanz unter
 * `https://analytics.schartl.dev`. Die Script-URL ist via
 * `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC` überschreibbar; Default ist die
 * self-hosted Instanz.
 *
 * Doku: https://plausible.io/docs/script-extensions
 */
const DEFAULT_PLAUSIBLE_SCRIPT_SRC = "https://analytics.schartl.dev/js/script.js";

export function PlausibleScript() {
  if (process.env.NODE_ENV !== "production") return null;

  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "kickpact.com";
  if (!domain) return null;

  const scriptSrc =
    process.env.NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC ?? DEFAULT_PLAUSIBLE_SCRIPT_SRC;

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
