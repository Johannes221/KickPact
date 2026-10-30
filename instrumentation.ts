// Next.js 15 instrumentation entrypoint.
// Wird von Next.js automatisch geladen, bevor Code in Server-/Edge-Routes läuft.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    assertProdEnv();
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Zentrale Fail-Fast-Env-Validierung beim Boot (nur Prod, nur Node-Runtime).
 * Ohne sie entscheidet jedes Subsystem selbst: DB/Auth/Mail crashen laut, aber
 * Sentry/Redis/R2/Stripe degradieren STILL — ein vergessenes Env fällt erst im
 * Incident auf. Hart-Pflicht wirft (Deploy schlägt sofort fehl); still-
 * degradierende werden nur laut geloggt (im Coolify-Deploy-Log sichtbar).
 */
function assertProdEnv() {
  if (process.env.NODE_ENV !== "production") return;

  // Boot-Pflicht: ohne diese kann die App keine korrekte Runde drehen. RESEND/
  // MAIL_FROM bleiben hart, weil der Login (Magic-Links) sonst nicht funktioniert
  // — ein bootender, aber login-loser Server ist schlimmer als ein Fail-Fast.
  const hardRequired = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "NEXT_PUBLIC_BASE_URL",
    "NEXT_PUBLIC_SITE_ENV",
    "RESEND_API_KEY",
    "MAIL_FROM"
  ];
  const missing = hardRequired.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[boot] Prod-Pflicht-Env fehlt: ${missing.join(", ")}. Deploy abgebrochen.`
    );
  }

  // Origin-Konsistenz: better-auth verwirft sonst Requests / Cookie bindet an
  // den falschen Host (App bleibt ausgeloggt, Mail-Links zeigen woanders hin).
  // HART werfen statt nur warnen: eine still im Coolify-Log untergehende Warnung
  // reicht nicht — ein Staging-Copy-Paste (schartl.dev vs kickpact.com) darf den
  // Prod-Deploy nicht grün booten lassen.
  if (process.env.BETTER_AUTH_URL !== process.env.NEXT_PUBLIC_BASE_URL) {
    throw new Error(
      `[boot] BETTER_AUTH_URL (${process.env.BETTER_AUTH_URL}) != NEXT_PUBLIC_BASE_URL (${process.env.NEXT_PUBLIC_BASE_URL}) — beide MÜSSEN in Prod dieselbe Origin sein. Deploy abgebrochen.`
    );
  }

  // Still degradierende Vars: nur warnen, nicht Boot abbrechen.
  const shouldSet: Record<string, string> = {
    // Bewusst KEIN Boot-Blocker (2026-07-19): /api/inngest ist fail-closed (503
    // ohne Key), die App bootet also sicher. Bis der Key gesetzt ist, laufen nur
    // KEINE Hintergrund-Jobs (Crawling, Rechnungslauf, Erinnerungs-Mails).
    INNGEST_SIGNING_KEY: "Hintergrund-Jobs (Crawling/Rechnungen/Mails) laufen NICHT",
    SENTRY_DSN: "Error-Tracking (Server) inaktiv",
    NEXT_PUBLIC_SENTRY_DSN: "Error-Tracking (Client) inaktiv",
    REDIS_URL: "Rate-Limit läuft nur In-Memory pro Instanz",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "PDFs/Uploads auf ephemerem Container-Speicher (Verlust bei Deploy)"
  };
  const degraded = Object.keys(shouldSet).filter((k) => !process.env[k]);
  if (degraded.length > 0) {
    console.warn(
      "[boot] ⚠️  Optionale-aber-empfohlene Prod-Env fehlt:\n" +
        degraded.map((k) => `  - ${k}: ${shouldSet[k]}`).join("\n")
    );
  }
}

// Erfasst React Server Component Errors automatisch (Next.js 15+).
export { captureRequestError as onRequestError } from "@sentry/nextjs";
