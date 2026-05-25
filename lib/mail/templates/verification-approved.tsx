export function verificationApprovedEmail(args: {
  clubName: string;
  dashboardUrl: string;
  withheldInvoiceCount: number;
}): { subject: string; html: string; text: string } {
  const { clubName, dashboardUrl, withheldInvoiceCount } = args;
  const invoiceLine =
    withheldInvoiceCount > 0
      ? `\n\nWir haben ${withheldInvoiceCount} Rechnung${withheldInvoiceCount === 1 ? "" : "en"} versandt, die wir bis zur Freischaltung zurückgehalten hatten.`
      : "";
  const invoiceHtml =
    withheldInvoiceCount > 0
      ? `<p style="color: #525252; margin: 0 0 16px;">Wir haben <strong>${withheldInvoiceCount}</strong> Rechnung${withheldInvoiceCount === 1 ? "" : "en"} versandt, die wir bis zur Freischaltung zurückgehalten hatten.</p>`
      : "";

  return {
    subject: `${clubName} ist freigeschaltet ✓`,
    text: `Hi,\n\n${clubName} ist verifiziert und vollständig freigeschaltet. Sponsoren können jetzt ohne Banner pledgen und Rechnungen gehen automatisch raus.${invoiceLine}\n\nDashboard: ${dashboardUrl}\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">${escapeHtml(clubName)} ist freigeschaltet ✓</h1>
      <p style="color: #525252; margin: 0 0 16px;">Dein Verein ist verifiziert und vollständig aktiv. Sponsoren können jetzt ohne Hinweis pledgen, Rechnungen gehen automatisch raus.</p>
      ${invoiceHtml}
      <a href="${dashboardUrl}" style="display: inline-block; background:#01C457; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Zum Dashboard</a>
    </td></tr>
  </table>
</body></html>`
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
