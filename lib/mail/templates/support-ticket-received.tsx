function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Eingangs-Bestätigung an den Kunden, sobald ein Ticket erstellt wurde — mit
 * Referenz + Link ins In-App-Ticket-Center. Gibt dem Absender einen festen
 * Bezugspunkt (gap: Kunde bekam bisher keine Rückmeldung).
 */
export function supportTicketReceivedEmail(args: {
  recipientName: string;
  subject: string;
  reference: string;
  ticketUrl: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, subject, reference, ticketUrl } = args;
  return {
    subject: `Wir haben deine Anfrage erhalten [${reference}]`,
    text: `Hi ${recipientName},

danke für deine Nachricht — wir haben sie erhalten und melden uns so schnell wie möglich.

Referenz: ${reference}
Betreff: ${subject}

Status & Antworten findest du jederzeit hier: ${ticketUrl}

— Das KickPact-Team`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Support · ${escapeHtml(reference)}</p>
      <h1 style="font-size: 20px; margin: 0 0 12px;">Wir haben deine Anfrage erhalten</h1>
      <p style="color:#525252; margin:0 0 16px;">Hi ${escapeHtml(recipientName)}, danke für deine Nachricht — wir melden uns so schnell wie möglich bei dir.</p>
      <p style="color:#525252; margin:0 0 4px;"><strong>Betreff:</strong> ${escapeHtml(subject)}</p>
      <p style="color:#525252; margin:0 0 24px;"><strong>Referenz:</strong> ${escapeHtml(reference)}</p>
      <a href="${ticketUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Status ansehen</a>
      <p style="color:#a3a3a3; font-size:13px; margin-top:32px;">— Das KickPact-Team</p>
    </td></tr>
  </table>
</body></html>`
  };
}
