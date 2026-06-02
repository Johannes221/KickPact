function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const PRIORITY_LABEL: Record<string, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend"
};

export function supportNewTicketEmail(args: {
  category: string;
  subject: string;
  fromName: string;
  fromEmail: string;
  adminUrl: string;
  priority?: string;
  /** Kurzer Kontext, z.B. „Spiel: SV A – FC B (2:1)". */
  context?: string | null;
}): { subject: string; html: string; text: string } {
  const { category, subject, fromName, fromEmail, adminUrl, priority, context } = args;
  const priorityLabel = priority ? PRIORITY_LABEL[priority] ?? priority : null;
  const urgent = priority === "urgent" || priority === "high";

  const textLines = [
    `Neues Support-Ticket (${category})`,
    priorityLabel ? `Priorität: ${priorityLabel}` : null,
    "",
    `Von: ${fromName} <${fromEmail}>`,
    `Betreff: ${subject}`,
    context ? `Kontext: ${context}` : null,
    "",
    `Im Panel öffnen: ${adminUrl}`
  ].filter((l) => l !== null);

  return {
    subject: `${urgent ? "⚠ " : ""}Neues Support-Ticket: ${subject}`,
    text: textLines.join("\n"),
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 32px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Operator</p>
      <h1 style="font-size: 20px; margin: 0 0 12px;">Neues Support-Ticket</h1>
      <p style="color:#525252; margin:0 0 4px;"><strong>Kategorie:</strong> ${escapeHtml(category)}</p>
      ${priorityLabel ? `<p style="color:${urgent ? "#dc2626" : "#525252"}; margin:0 0 4px;"><strong>Priorität:</strong> ${escapeHtml(priorityLabel)}</p>` : ""}
      <p style="color:#525252; margin:0 0 4px;"><strong>Von:</strong> ${escapeHtml(fromName)} &lt;${escapeHtml(fromEmail)}&gt;</p>
      <p style="color:#171717; margin:0 0 ${context ? "4px" : "20px"};"><strong>Betreff:</strong> ${escapeHtml(subject)}</p>
      ${context ? `<p style="color:#525252; margin:0 0 20px;"><strong>Kontext:</strong> ${escapeHtml(context)}</p>` : ""}
      <a href="${adminUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Im Panel öffnen</a>
    </td></tr>
  </table>
</body></html>`
  };
}
