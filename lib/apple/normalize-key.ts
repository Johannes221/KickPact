/**
 * Normalisiert einen PEM-Private-Key aus einer Env-Var.
 *
 * Env-Stores zerlegen mehrzeilige Werte gern: Coolify zog die `.p8` zu EINER
 * Zeile zusammen (0 Umbrüche), andere Systeme escapen sie zu `\n`. Ein PEM ohne
 * echte Zeilenumbrüche ist für Node-`crypto`/ES256 ungültig → App-Store-Server-API
 * schlägt fehl. Diese Funktion stellt ein valides PEM wieder her:
 *
 *   - echte Umbrüche vorhanden → unverändert (No-op für korrekte Keys)
 *   - `\n`-escaped → in echte Umbrüche
 *   - alles in einer Zeile → Base64-Body neu bei 64 Zeichen umbrechen
 */
export function normalizeApplePrivateKey(raw: string): string {
  let s = raw.trim().replace(/\\n/g, "\n");
  if (s.includes("\n")) return s.endsWith("\n") ? s : s + "\n";

  const m = s.match(/-----BEGIN ([A-Z0-9 ]+?)-----(.*?)-----END \1-----/);
  if (!m) return s; // kein erkennbares PEM → unverändert zurück
  const label = m[1].trim();
  const body = m[2].replace(/\s+/g, "");
  const wrapped = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----\n`;
}
