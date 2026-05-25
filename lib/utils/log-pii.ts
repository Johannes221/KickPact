/**
 * Audit 2026-05-24 Phase 4 / Task 4.3: PII-Maskierung für Logs.
 *
 * Coolify-Logs + Inngest-Dashboard zeigen sämtliche `logger.info/.error/...`
 * Payloads als Klartext. E-Mail-Adressen in Logs sind PII und in Drittland-
 * Log-Aggregatoren ein Datenschutz-Risiko.
 *
 * `maskEmail("johannes.schartl@gmail.com")` → `"joh***@gmail.com"`
 * `maskEmail(["a@x.de", "b@y.de"])` → `["a***@x.de", "b***@y.de"]`
 * `maskEmail(undefined)` → `"unknown"`
 *
 * Strategie: erste 3 Zeichen + "***" + "@" + Domain. Domain bleibt sichtbar
 * für Operative-Debugging (z.B. "ist das @gmail.com oder @schartl.dev?"),
 * Local-Part wird auf 3 Zeichen gekürzt — nicht-rekonstruierbar bei
 * unbekannter Inbox.
 */
export function maskEmail(email: string | null | undefined): string;
export function maskEmail(emails: readonly string[]): string[];
export function maskEmail(
  input: string | null | undefined | readonly string[]
): string | string[] {
  if (Array.isArray(input)) {
    return input.map((e) => maskOne(e));
  }
  return maskOne(input as string | null | undefined);
}

function maskOne(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return "unknown";
  const at = email.indexOf("@");
  if (at < 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const visible = local.slice(0, Math.min(3, local.length));
  return `${visible}***${domain}`;
}
