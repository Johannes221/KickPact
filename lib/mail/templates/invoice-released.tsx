/**
 * Mail an Sponsor(en), wenn zurückgehaltene Rechnungen nach
 * Verein/Mannschafts-Verifizierung freigegeben wurden (Phase E3).
 *
 * Kein PDF im Anhang — der Sponsor sieht die PDF im KickPact-Dashboard.
 * Phase E4 könnte hier nachrüsten.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function invoiceReleasedEmail(args: {
  sponsorName: string;
  /** Name des Vereins oder der Mannschaft, je nach Kontext. */
  entityName: string;
  invoiceCount: number;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const { sponsorName, entityName, invoiceCount, dashboardUrl } = args;
  const countLabel =
    invoiceCount === 1
      ? "eine zurückgehaltene Rechnung"
      : `${invoiceCount} zurückgehaltene Rechnungen`;

  return {
    subject: `${countLabel.charAt(0).toUpperCase() + countLabel.slice(1)} von ${entityName} ${invoiceCount === 1 ? "ist" : "sind"} jetzt verfügbar`,
    text: `Hi ${sponsorName},

${entityName} wurde gerade auf KickPact verifiziert.

${countLabel.charAt(0).toUpperCase() + countLabel.slice(1)}, die wir bislang zurückgehalten haben, ${invoiceCount === 1 ? "ist" : "sind"} jetzt in deinem Dashboard sichtbar.

Dashboard: ${dashboardUrl}

Tipp: Du findest alle Rechnungen unter "Abrechnungen" in deiner Sponsor-Übersicht.

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#fafafa;padding:40px 20px;margin:0;">
  <table style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;">
    <tr><td>
      <h1 style="font-size:22px;margin:0 0 4px;color:#1A1A2E;font-weight:800;">KickPact</h1>
      <p style="color:#525252;margin:0 0 28px;font-size:13px;">Performance-Sponsoring im Amateurfußball</p>

      <h2 style="font-size:18px;margin:0 0 12px;color:#1A1A2E;">Hi ${escapeHtml(sponsorName)},</h2>
      <p style="color:#1A1A2E;margin:0 0 16px;line-height:1.6;">
        <strong>${escapeHtml(entityName)}</strong> wurde soeben verifiziert.
      </p>
      <p style="color:#525252;margin:0 0 20px;line-height:1.6;">
        ${escapeHtml(countLabel.charAt(0).toUpperCase() + countLabel.slice(1))},
        die wir bis zur Freischaltung zurückgehalten ${invoiceCount === 1 ? "haben" : "hatten"},
        ${invoiceCount === 1 ? "ist" : "sind"} jetzt in deinem Dashboard verfügbar.
      </p>

      <a href="${dashboardUrl}" style="display:inline-block;background:#01C457;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
        Zu meinen Rechnungen
      </a>

      <p style="color:#a3a3a3;font-size:11px;margin-top:36px;border-top:1px solid #e5e5e5;padding-top:16px;">
        KickPact bleibt zwischen Verein und Sponsor — wir leiten kein Geld weiter.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
