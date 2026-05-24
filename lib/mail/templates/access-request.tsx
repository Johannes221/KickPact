export function accessRequestEmail(args: {
  clubName: string;
  requesterEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  requestedTeamName: string | null;
  message: string | null;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, requesterEmail, requestedRole, requestedTeamName, message, reviewUrl } = args;
  const scope = requestedTeamName
    ? `nur für die Mannschaft „${requestedTeamName}"`
    : `für den ganzen Verein`;
  const roleLabel =
    requestedRole === "admin" ? "Admin" : requestedRole === "trainer" ? "Trainer" : "Viewer";

  return {
    subject: `Neue Zugriff-Anfrage für ${clubName}`,
    text: `Hi,\n\n${requesterEmail} möchte ${roleLabel}-Zugriff ${scope} bei ${clubName}.${message ? `\n\nNachricht: "${message}"` : ""}\n\nAnfrage prüfen: ${reviewUrl}\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Neue Zugriff-Anfrage</h1>
      <p style="color: #525252; margin: 0 0 24px;"><strong>${escapeHtml(requesterEmail)}</strong> möchte <strong>${roleLabel}</strong>-Zugriff ${scope} bei <strong>${escapeHtml(clubName)}</strong>.</p>
      ${message ? `<blockquote style="border-left: 3px solid #FF5722; padding: 8px 16px; margin: 16px 0; color: #525252; background: #fafafa;">${escapeHtml(message)}</blockquote>` : ""}
      <a href="${reviewUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Anfrage prüfen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Falls der Button nicht funktioniert, öffne diese URL: <a href="${reviewUrl}" style="color:#a3a3a3;">${reviewUrl}</a></p>
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
