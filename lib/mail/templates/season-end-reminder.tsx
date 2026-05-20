export function seasonEndReminderEmail(args: {
  sponsorName: string;
  teamName: string;
  clubName: string;
  endsAt: Date;
  pledgeId: string;
  renewUrl: string;
}): { subject: string; html: string; text: string } {
  const { sponsorName, teamName, clubName, endsAt, renewUrl } = args;
  const endsLabel = endsAt.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });

  return {
    subject: `Deine Pledge für ${teamName} endet bald — Saison verlängern?`,
    text: `Hi ${sponsorName},

deine Pledge für ${teamName} (${clubName}) läuft zum ${endsLabel} aus.

Möchtest du nahtlos in die nächste Saison verlängern? Ein Klick genügt:
${renewUrl}

Wenn nicht, läuft alles automatisch aus — du musst nichts tun.

Danke fürs Mitfiebern in dieser Saison! 💚

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#F5F8F5; padding: 40px 20px; margin:0;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:14px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 26px; margin: 0 0 4px; color:#1A1A2E; font-weight: 800;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 28px; font-size: 14px;">Saison-Ende steht an</p>

      <h2 style="font-size: 20px; margin: 0 0 8px; color:#1A1A2E;">Hi ${sponsorName},</h2>
      <p style="color: #1A1A2E; margin: 0 0 16px; line-height: 1.6;">
        deine Pledge für <strong>${teamName}</strong> bei <strong>${clubName}</strong> läuft am
        <strong>${endsLabel}</strong> aus.
      </p>
      <p style="color: #1A1A2E; margin: 0 0 24px; line-height: 1.6;">
        Möchtest du in die nächste Saison verlängern? Mit einem Klick übernimmst du deine
        bisherigen Trigger + Beträge:
      </p>

      <a href="${renewUrl}" style="display:inline-block; background:#01C457; color:#fff; padding: 12px 24px; border-radius:10px; font-weight:700; text-decoration:none;">Pledge verlängern →</a>

      <p style="color:#525252; font-size: 14px; line-height: 1.6; margin: 24px 0 0;">
        Wenn du nicht reagierst, läuft alles automatisch aus — keine weiteren Charges,
        keine Rechnung. Du kannst jederzeit später neu starten.
      </p>

      <p style="color: #a3a3a3; font-size: 11px; margin-top: 36px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        Danke fürs Mitfiebern in dieser Saison.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
