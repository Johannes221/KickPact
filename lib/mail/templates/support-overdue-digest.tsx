function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface OverdueDigestItem {
  reference: string;
  subject: string;
  priority: string;
  ageHours: number;
  url: string;
}

/**
 * Tages-Digest überfälliger Support-Tickets an die Operatoren (SLA-Reminder).
 * Wird nur versendet, wenn mindestens ein Ticket überfällig ist.
 */
export function supportOverdueDigestEmail(args: {
  items: OverdueDigestItem[];
  thresholdHours: number;
  inboxUrl: string;
}): { subject: string; html: string; text: string } {
  const { items, thresholdHours, inboxUrl } = args;
  const count = items.length;

  const rows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 0; border-bottom:1px solid #eee;">
            <a href="${i.url}" style="color:#FF5722; font-weight:600; text-decoration:none;">${escapeHtml(i.reference)}</a>
            <span style="color:#171717;"> · ${escapeHtml(i.subject)}</span>
            <br/><span style="color:#a3a3a3; font-size:12px;">Priorität ${escapeHtml(i.priority)} · seit ${i.ageHours} h offen</span>
          </td>
        </tr>`
    )
    .join("");

  const textLines = [
    `${count} überfällige(s) Support-Ticket(s) (älter als ${thresholdHours} h, Kunde wartet):`,
    "",
    ...items.map((i) => `- [${i.reference}] ${i.subject} (Priorität ${i.priority}, ${i.ageHours} h) → ${i.url}`),
    "",
    `Inbox: ${inboxUrl}`
  ];

  return {
    subject: `⏰ ${count} überfällige Support-Tickets`,
    text: textLines.join("\n"),
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; padding: 32px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Operator</p>
      <h1 style="font-size: 20px; margin: 0 0 8px;">${count} überfällige Tickets</h1>
      <p style="color:#525252; margin:0 0 16px;">Älter als ${thresholdHours} h und der Kunde wartet auf Antwort:</p>
      <table style="width:100%; border-collapse:collapse;">${rows}</table>
      <p style="margin:24px 0 0;"><a href="${inboxUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Zur Inbox</a></p>
    </td></tr>
  </table>
</body></html>`
  };
}
