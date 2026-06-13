/**
 * Erwartete Geschäfts-/Eingabe-Validierungs-Fehler, die als Server-Action-Throw
 * beim Nutzer als Toast/Form-Fehler landen (z.B. „Verein bereits registriert"
 * im Onboarding). Das sind KEINE Bugs — Sentry soll sie nicht als Issue
 * erfassen (sonst Rauschen, das echte Fehler überdeckt).
 *
 * BEWUSST eine ENGE Allowlist: nur eindeutige User-Flow-Ablehnungen. Generische
 * „… nicht gefunden"-/Authz-/Infra-Meldungen bleiben DRIN — die könnten echte
 * Bugs (kaputter Link, Query-Fehler, IDOR-Versuch) maskieren. Genutzt im
 * `beforeSend` der sentry.{server,edge}.config.
 */
const EXPECTED_USER_ERROR_SUBSTRINGS: readonly string[] = [
  "bereits bei KickPact registriert",
  "bereits vollständig onboarded",
  "nimmt aktuell keine Anfragen entgegen",
  "nicht selbst sponsern",
  "Zu viele Anfragen in kurzer Zeit"
];

/** True, wenn die Fehlermeldung eine erwartete User-Ablehnung ist (kein Bug). */
export function isExpectedUserError(
  message: string | null | undefined
): boolean {
  if (!message) return false;
  return EXPECTED_USER_ERROR_SUBSTRINGS.some((s) => message.includes(s));
}
