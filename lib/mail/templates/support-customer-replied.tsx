function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Benachrichtigung an Operator/Assignee, wenn ein Kunde in-App auf ein Ticket
 * geantwortet hat (best-effort).
 */
export function supportCustomerRepliedEmail(args: {
  reference: string;
  subject: string;
  fromName: string;
  excerpt: string;
  adminUrl: string;
}): { subject: string; html: string; text: string } {
  const { reference, subject, fromName, excerpt, adminUrl } = args;
  const shortExcerpt = excerpt.length > 280 ? `${excerpt.slice(0, 277)}…` : excerpt;
  return {
    subject: `Kundenantwort: ${subject} [${reference}]`,
    text: `${fromName} hat auf das Ticket geantwortet (${reference}).

"${shortExcerpt}"

Im Panel öffnen: ${adminUrl}`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 32px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Operator · ${escapeHtml(reference)}</p>
      <h1 style="font-size: 20px; margin: 0 0 12px;">Neue Kundenantwort</h1>
      <p style="color:#525252; margin:0 0 4px;"><strong>Von:</strong> ${escapeHtml(fromName)}</p>
      <p style="color:#171717; margin:0 0 16px;"><strong>Betreff:</strong> ${escapeHtml(subject)}</p>
      <blockquote style="margin:0 0 20px; padding:12px 16px; background:#f5f5f5; border-left:3px solid #FF5722; color:#404040; line-height:1.6;">${escapeHtml(shortExcerpt)}</blockquote>
      <a href="${adminUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Im Panel öffnen</a>
    </td></tr>
  </table>
</body></html>`
  };
}
