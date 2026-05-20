export function magicLinkEmail(args: { url: string; email: string }): {
  subject: string;
  html: string;
  text: string;
} {
  const { url, email } = args;
  return {
    subject: "Dein KickPact-Login-Link",
    text: `Hi,\n\nklick auf diesen Link um dich bei KickPact einzuloggen:\n${url}\n\nDer Link ist 15 Minuten gültig.\n\nFalls du das nicht warst, ignorier diese Mail einfach.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 28px; margin: 0 0 8px;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 24px;">Dein Login-Link, gültig 15 Minuten.</p>
      <a href="${url}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Bei KickPact einloggen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Falls der Button nicht funktioniert, kopier diese URL:<br/><a href="${url}" style="color:#a3a3a3;">${url}</a></p>
    </td></tr>
  </table>
</body></html>`
  };
}
