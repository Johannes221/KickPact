export function adminPasswordResetEmail(args: { url: string; email: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { url } = args;
  return {
    subject: "KickPact Operator — Passwort zurücksetzen",
    text: `Hi,\n\nfür deinen KickPact-Operator-Account wurde ein Passwort-Reset angefordert.\nKlick auf diesen Link, um ein neues Passwort zu setzen:\n${url}\n\nDer Link ist 60 Minuten gültig.\n\nFalls du das nicht warst, ignorier diese Mail — dein Passwort bleibt unverändert.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 4px;">KickPact Operator</p>
      <h1 style="font-size: 28px; margin: 0 0 8px;">Passwort zurücksetzen</h1>
      <p style="color: #525252; margin: 0 0 24px;">Setze hier ein neues Passwort für deinen Operator-Account. Der Link ist 60 Minuten gültig.</p>
      <a href="${url}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Neues Passwort setzen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Falls der Button nicht funktioniert, kopier diese URL:<br/><a href="${url}" style="color:#a3a3a3;">${url}</a></p>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 16px;">Falls du keinen Reset angefordert hast, ignorier diese Mail.</p>
    </td></tr>
  </table>
</body></html>`
  };
}
