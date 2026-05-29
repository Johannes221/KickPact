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
}): { subject: string; html: string; text: string } {
  const { recipientName, subject, body } = args;
  const safeBody = escapeHtml(body).replace(/\n/g, "<br/>");
  return {
    subject: `Re: ${subject}`,
    text: `Hi ${recipientName},\n\n${body}\n\n— Das KickPact-Team`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Support</p>
      <p style="color:#525252; margin:0 0 16px;">Hi ${escapeHtml(recipientName)},</p>
      <div style="color:#171717; line-height:1.6;">${safeBody}</div>
      <p style="color:#a3a3a3; font-size:13px; margin-top:32px;">— Das KickPact-Team</p>
    </td></tr>
  </table>
</body></html>`
  };
}
