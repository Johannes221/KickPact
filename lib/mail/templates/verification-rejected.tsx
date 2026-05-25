export function verificationRejectedEmail(args: {
  clubName: string;
  reason: string;
  reuploadUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, reason, reuploadUrl } = args;

  return {
    subject: `Bescheinigung für ${clubName} abgelehnt`,
    text: `Hi,\n\nwir konnten deinen Vertretungs-Nachweis für ${clubName} nicht akzeptieren.\n\nBegründung: "${reason}"\n\nDu kannst eine neue Bescheinigung hochladen: ${reuploadUrl}\n\nFalls du Fragen hast, schreib uns an support@kickpact.de.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Bescheinigung abgelehnt</h1>
      <p style="color: #525252; margin: 0 0 16px;">Wir konnten deinen Vertretungs-Nachweis für <strong>${escapeHtml(clubName)}</strong> nicht akzeptieren.</p>
      <blockquote style="border-left: 3px solid #a3a3a3; padding: 8px 16px; margin: 16px 0; color: #525252; background: #fafafa;">${escapeHtml(reason)}</blockquote>
      <a href="${reuploadUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Neue Bescheinigung hochladen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 24px;">Fragen? Schreib uns an support@kickpact.de.</p>
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
