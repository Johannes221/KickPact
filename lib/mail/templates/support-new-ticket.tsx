function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function supportNewTicketEmail(args: {
  category: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  adminUrl: string;
}): { subject: string; html: string; text: string } {
  const { category, subject, fromName, fromEmail, adminUrl } = args;
  return {
    subject: `Neues Support-Ticket: ${subject}`,
    text: `Neues Support-Ticket (${category})\n\nVon: ${fromName} <${fromEmail}>\nBetreff: ${subject}\n\nIm Panel öffnen: ${adminUrl}`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 32px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Operator</p>
      <h1 style="font-size: 20px; margin: 0 0 12px;">Neues Support-Ticket</h1>
      <p style="color:#525252; margin:0 0 4px;"><strong>Kategorie:</strong> ${escapeHtml(category)}</p>
      <p style="color:#525252; margin:0 0 4px;"><strong>Von:</strong> ${escapeHtml(fromName)} &lt;${escapeHtml(fromEmail)}&gt;</p>
      <p style="color:#171717; margin:0 0 20px;"><strong>Betreff:</strong> ${escapeHtml(subject)}</p>
      <a href="${adminUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Im Panel öffnen</a>
    </td></tr>
  </table>
</body></html>`
  };
}
