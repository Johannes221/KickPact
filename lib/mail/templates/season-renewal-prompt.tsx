export function seasonRenewalPromptEmail(args: {
  sponsorName: string;
  teamName: string;
  clubName: string;
  currentSaison: string;
  nextSaison: string;
  endsAt: Date;
  renewUrl: string;
  declineUrl: string;
}): { subject: string; html: string; text: string } {
  const {
    sponsorName,
    teamName,
    clubName,
    currentSaison,
    nextSaison,
    endsAt,
    renewUrl,
    declineUrl
  } = args;
  const endsLabel = endsAt.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return {
    subject: `Pact ${teamName} verlängern auf Saison ${nextSaison}?`,
    text: `Hi ${sponsorName},

dein Pact für ${teamName} (${clubName}) läuft mit der Saison ${currentSaison}
am ${endsLabel} aus.

Möchtest du nahtlos auf die nächste Saison ${nextSaison} verlängern?
Mit einem Klick übernimmst du deine bisherigen Trigger + Beträge:

  Ja, verlängern → ${renewUrl}

Falls du nicht möchtest:

  Nein, danke → ${declineUrl}

Wenn du gar nicht reagierst, läuft alles automatisch aus — du musst nichts tun.

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#F5F8F5; padding: 40px 20px; margin:0;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:14px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 26px; margin: 0 0 4px; color:#1A1A2E; font-weight: 800;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 28px; font-size: 14px;">Nächste Saison verlängern?</p>

      <h2 style="font-size: 20px; margin: 0 0 8px; color:#1A1A2E;">Hi ${sponsorName},</h2>
      <p style="color: #1A1A2E; margin: 0 0 16px; line-height: 1.6;">
        dein Pact für <strong>${teamName}</strong> bei <strong>${clubName}</strong> läuft
        mit der Saison <strong>${currentSaison}</strong> am <strong>${endsLabel}</strong> aus.
      </p>
      <p style="color: #1A1A2E; margin: 0 0 24px; line-height: 1.6;">
        Möchtest du nahtlos auf die nächste Saison <strong>${nextSaison}</strong>
        verlängern? Mit einem Klick übernimmst du deine bisherigen Trigger + Beträge:
      </p>

      <table cellpadding="0" cellspacing="0" style="margin: 8px 0 24px;">
        <tr>
          <td style="padding-right: 8px;">
            <a href="${renewUrl}" style="display:inline-block; background:#01C457; color:#fff; padding: 12px 24px; border-radius:10px; font-weight:700; text-decoration:none;">Ja, verlängern →</a>
          </td>
          <td>
            <a href="${declineUrl}" style="display:inline-block; background:#F1F5F9; color:#475569; padding: 12px 20px; border-radius:10px; font-weight:600; text-decoration:none;">Nein, danke</a>
          </td>
        </tr>
      </table>

      <p style="color:#525252; font-size: 13px; line-height: 1.6; margin: 24px 0 0;">
        Wenn du gar nicht reagierst, läuft dein Pact einfach aus — keine weiteren
        Charges, keine Rechnung.
      </p>

      <p style="color: #a3a3a3; font-size: 11px; margin-top: 36px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        Danke fürs Mitfiebern in dieser Saison.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
