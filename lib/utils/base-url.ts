/**
 * Zentrale Basis-URL für absolute Links (Mails, Stripe-Redirects, Tracking).
 *
 * Audit 2026-06-11 / Phase 2 / A8: Vorher streuten drei verschiedene
 * Fallback-Domains durch den Code (kickpact.schartl.dev, kickpact.de,
 * localhost) — Mails/Redirects aus Production zeigten je nach Datei auf die
 * falsche Domain. Eine Quelle:
 *
 * 1. NEXT_PUBLIC_BASE_URL (Coolify setzt das pro Environment),
 * 2. BETTER_AUTH_URL (ältere Envs, die nur diese Variable kennen),
 * 3. https://kickpact.com (Production-Default).
 *
 * Als Funktion statt Modul-Konstante, damit env-Änderungen in Tests
 * (vi.stubEnv) und Runtime-Injection greifen.
 */
export function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.BETTER_AUTH_URL ??
    "https://kickpact.com"
  );
}
