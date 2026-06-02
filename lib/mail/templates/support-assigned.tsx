function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Benachrichtigung an einen Operator, dem ein Ticket zugewiesen wurde. */
export function supportAssignedEmail(args: {
  reference: string;
  subject: string;
  priority: string;
  assignedBy: string;
  adminUrl: string;
}): { subject: string; html: string; text: string } {
  const { reference, subject, priority, assignedBy, adminUrl } = args;
  return {
    subject: `Dir zugewiesen: ${subject} [${reference}]`,
    text: `${assignedBy} hat dir ein Support-Ticket zugewiesen (${reference}).

Betreff: ${subject}
Priorität: ${priority}

Im Panel öffnen: ${adminUrl}`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 32px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Operator · ${escapeHtml(reference)}</p>
      <h1 style="font-size: 20px; margin: 0 0 12px;">Ticket dir zugewiesen</h1>
      <p style="color:#525252; margin:0 0 4px;">${escapeHtml(assignedBy)} hat dir dieses Ticket zugewiesen.</p>
      <p style="color:#171717; margin:0 0 4px;"><strong>Betreff:</strong> ${escapeHtml(subject)}</p>
      <p style="color:#525252; margin:0 0 20px;"><strong>Priorität:</strong> ${escapeHtml(priority)}</p>
      <a href="${adminUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Im Panel öffnen</a>
    </td></tr>
  </table>
</body></html>`
  };
}
