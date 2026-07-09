/**
 * HTML-Escaping für user-kontrollierte Werte, die in inline gebaute HTML-Mails
 * oder öffentliche HTML-Ausgaben interpoliert werden. Ohne dieses Escaping kann
 * ein Nutzer (z.B. über einen Anfrage-/Antwort-Freitext) HTML/Links in eine Mail
 * von der vertrauenswürdigen KickPact-Absenderadresse einschleusen (Phishing-/
 * Content-Injection). React-`.tsx`-Templates escapen automatisch — nur die
 * handgebauten Template-Strings brauchen diesen Helper.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
