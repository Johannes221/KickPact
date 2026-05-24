export function accessRequestRejectedEmail(args: {
  clubName: string;
  reason: string | null;
}): { subject: string; html: string; text: string } {
  const { clubName, reason } = args;

  return {
    subject: `Anfrage für ${clubName} abgelehnt`,
    text: `Hi,\n\ndeine Zugriff-Anfrage für ${clubName} wurde abgelehnt.${reason ? `\n\nBegründung: "${reason}"` : ""}\n\nDu kannst eine neue Anfrage stellen oder dich direkt an den Vereins-Admin wenden.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Anfrage abgelehnt</h1>
      <p style="color: #525252; margin: 0 0 24px;">Deine Zugriff-Anfrage für <strong>${escapeHtml(clubName)}</strong> wurde abgelehnt.</p>
      ${reason ? `<blockquote style="border-left: 3px solid #a3a3a3; padding: 8px 16px; margin: 16px 0; color: #525252; background: #fafafa;">${escapeHtml(reason)}</blockquote>` : ""}
      <p style="color: #525252; font-size: 14px;">Du kannst eine neue Anfrage stellen oder dich direkt an den Vereins-Admin wenden.</p>
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
