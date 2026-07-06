export function invoiceReminderEmail(args: {
  sponsorName: string;
  clubName: string;
  period: string;
  totalEur: string;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const { sponsorName, clubName, period, totalEur, dashboardUrl } = args;
  return {
    subject: `Erinnerung: Deine KickPact-Zahlungsübersicht · ${period}`,
    text: `Hi ${sponsorName},\n\neine kurze Erinnerung an deine KickPact-Zahlungsübersicht für ${period} (${clubName}), Gesamt ${totalEur}.\n\nDu findest sie in deinem Dashboard:\n${dashboardUrl}\n\n— Das KickPact-Team`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact</p>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Zahlungserinnerung</h1>
      <p style="color: #525252; margin: 0 0 16px;">Hi ${sponsorName}, deine Zahlungsübersicht für <strong>${period}</strong> (${clubName}) über <strong>${totalEur}</strong> ist noch offen.</p>
      <a href="${dashboardUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Übersicht ansehen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">— Das KickPact-Team</p>
    </td></tr>
  </table>
</body></html>`
  };
}
