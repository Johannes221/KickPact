function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function supportReplyEmail(args: {
  recipientName: string;
  subject: string;
  body: string;
  /** Menschen-lesbare Ticket-Referenz, z.B. „KP-7F8A2C". */
  reference?: string;
  /** Link ins In-App-Ticket-Center, um anzusehen / zu antworten. */
  ticketUrl?: string;
}): { subject: string; html: string; text: string } {
  const { recipientName, subject, body, reference, ticketUrl } = args;
  const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");
  const refSuffix = reference ? ` [${reference}]` : "";

  const textLines = [
    `Hi ${recipientName},`,
    "",
    body,
    "",
    ticketUrl ? `Ansehen & antworten: ${ticketUrl}` : null,
    "— Das KickPact-Team"
  ].filter((l) => l !== null);

  return {
    subject: `Re: ${subject}${refSuffix}`,
    text: textLines.join("\n"),
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Support${reference ? ` · ${escapeHtml(reference)}` : ""}</p>
      <p style="color:#525252; margin:0 0 16px;">Hi ${escapeHtml(recipientName)},</p>
      <div style="color:#171717; line-height:1.6;">${safeBody}</div>
      ${
        ticketUrl
          ? `<p style="margin:28px 0 0;"><a href="${ticketUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Ansehen &amp; antworten</a></p>`
          : ""
      }
      <p style="color:#a3a3a3; font-size:13px; margin-top:32px;">— Das KickPact-Team</p>
    </td></tr>
  </table>
</body></html>`
  };
}
