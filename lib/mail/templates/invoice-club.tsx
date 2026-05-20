export function invoiceClubEmail(args: {
  adminName?: string;
  clubName: string;
  sponsorName: string;
  period: string;
  totalEur: string;
  invoiceNumber: string;
  itemCount: number;
}): { subject: string; html: string; text: string } {
  const { adminName, clubName, sponsorName, period, totalEur, invoiceNumber, itemCount } = args;
  const greeting = adminName ? `Hi ${adminName},` : "Hallo,";

  return {
    subject: `Rechnung ${invoiceNumber} an ${sponsorName} verschickt · ${period}`,
    text: `${greeting}

KickPact hat eine Rechnung an ${sponsorName} (${clubName}) verschickt:

Rechnungsnummer: ${invoiceNumber}
Zeitraum: ${period}
Events: ${itemCount}
Gesamt: ${totalEur}

Die PDF liegt im Anhang als Kopie. Im KickPact-Dashboard kannst du markieren wann das Geld eingegangen ist.

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#F5F8F5; padding: 40px 20px; margin:0;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:14px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 26px; margin: 0 0 4px; color:#1A1A2E; font-weight: 800;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 28px; font-size: 14px;">Kopie zu deiner Rechnung an einen Sponsor</p>

      <h2 style="font-size: 20px; margin: 0 0 8px; color:#1A1A2E;">${greeting}</h2>
      <p style="color: #1A1A2E; margin: 0 0 16px; line-height: 1.6;">
        KickPact hat soeben eine Rechnung an <strong>${sponsorName}</strong> verschickt.
        Die PDF liegt als Kopie im Anhang.
      </p>

      <table style="width:100%; background:#F5F8F5; border-radius:10px; padding: 18px; margin: 16px 0 24px;">
        <tr><td style="color:#525252; font-size: 13px;">Rechnungsnummer</td><td style="text-align:right; font-weight: 600; color:#1A1A2E;">${invoiceNumber}</td></tr>
        <tr><td style="color:#525252; font-size: 13px;">Zeitraum</td><td style="text-align:right; color:#1A1A2E;">${period}</td></tr>
        <tr><td style="color:#525252; font-size: 13px;">Events</td><td style="text-align:right; color:#1A1A2E;">${itemCount}</td></tr>
        <tr><td style="color:#525252; font-size: 13px;">Gesamt</td><td style="text-align:right; font-size: 18px; font-weight: 800; color:#01C457;">${totalEur}</td></tr>
      </table>

      <p style="color:#525252; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Sobald das Geld vom Sponsor eingegangen ist, kannst du die Rechnung im Dashboard
        unter Abrechnungen als <em>bezahlt</em> markieren.
      </p>

      <p style="color: #a3a3a3; font-size: 11px; margin-top: 36px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        Verein: ${clubName}<br/>
        Die Zahlung läuft direkt zwischen Sponsor und Verein — KickPact ist nur das Tool.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
