/**
 * B4 (Audit 2026-06-11): Einladung als Mitglied (Trainer/Admin/Viewer) einer
 * Mannschaft bzw. eines Vereins. Link = bestehender Invite-Link
 * (`/team-einladung/<token>`), der Copy-Link in der UI bleibt als Fallback.
 */
export function teamEinladungEmail(args: {
  clubName: string;
  /** null = Verein-weite Einladung. */
  teamName: string | null;
  role: "admin" | "trainer" | "viewer";
  inviteUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, teamName, role, inviteUrl } = args;
  const roleLabel =
    role === "admin" ? "Admin" : role === "trainer" ? "Trainer" : "Viewer";
  const scope = teamName
    ? `die Mannschaft „${teamName}" (${clubName})`
    : `den Verein ${clubName}`;

  return {
    subject: `Einladung: ${teamName ?? clubName} auf KickPact`,
    text: `Hi,

du wurdest eingeladen, ${scope} auf KickPact als ${roleLabel} mitzubetreuen.

Einladung annehmen: ${inviteUrl}

Der Link ist 30 Tage gültig. Falls du die Einladung nicht erwartet hast, kannst du diese Mail ignorieren.

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Du bist eingeladen</h1>
      <p style="color: #525252; margin: 0 0 24px;">Du wurdest eingeladen, ${escapeHtml(scope)} auf KickPact als <strong>${roleLabel}</strong> mitzubetreuen.</p>
      <a href="${inviteUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Einladung annehmen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Der Link ist 30 Tage gültig. Falls der Button nicht funktioniert, öffne diese URL: <a href="${inviteUrl}" style="color:#a3a3a3;">${inviteUrl}</a></p>
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
