export function verificationSubmittedEmail(args: {
  clubName: string;
}): { subject: string; html: string; text: string } {
  const { clubName } = args;

  return {
    subject: `Wir prüfen die Bescheinigung für ${clubName}`,
    text: `Hi,\n\ndanke für deinen Vertretungs-Nachweis für ${clubName}. Unser Team prüft die Bescheinigung manuell — du hörst innerhalb von 1–2 Werktagen von uns.\n\nBis dahin kannst du Mannschaften konfigurieren und Sponsoren einladen. Rechnungen werden zurückgehalten und nach Freischaltung gebündelt verschickt.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Wir prüfen deine Bescheinigung</h1>
      <p style="color: #525252; margin: 0 0 16px;">Danke für deinen Vertretungs-Nachweis für <strong>${escapeHtml(clubName)}</strong>. Unser Team prüft die Bescheinigung manuell — du hörst innerhalb von 1–2 Werktagen von uns.</p>
      <p style="color: #525252; margin: 0;">Bis dahin kannst du Mannschaften konfigurieren und Sponsoren einladen. Rechnungen werden zurückgehalten und nach Freischaltung gebündelt verschickt.</p>
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
