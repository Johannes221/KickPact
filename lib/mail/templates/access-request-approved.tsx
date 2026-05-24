export function accessRequestApprovedEmail(args: {
  clubName: string;
  requestedRole: "admin" | "trainer" | "viewer";
  scopeLabel: string;
  homeUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, requestedRole, scopeLabel, homeUrl } = args;
  const roleLabel =
    requestedRole === "admin" ? "Admin" : requestedRole === "trainer" ? "Trainer" : "Viewer";

  return {
    subject: `Du hast jetzt Zugriff auf ${clubName}`,
    text: `Hi,\n\ndeine Anfrage für ${roleLabel}-Zugriff (${scopeLabel}) bei ${clubName} wurde genehmigt.\n\nLog dich ein: ${homeUrl}\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Zugriff genehmigt</h1>
      <p style="color: #525252; margin: 0 0 24px;">Deine Anfrage für <strong>${roleLabel}</strong>-Zugriff (${escapeHtml(scopeLabel)}) bei <strong>${escapeHtml(clubName)}</strong> wurde genehmigt.</p>
      <a href="${homeUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Zum Dashboard</a>
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
