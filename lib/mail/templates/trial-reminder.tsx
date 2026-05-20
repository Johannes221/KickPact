export function trialReminderEmail(args: {
  adminName: string | null;
  clubName: string;
  daysLeft: number;
  endsAt: Date;
  manageUrl: string;
}): { subject: string; html: string; text: string } {
  const { adminName, clubName, daysLeft, endsAt, manageUrl } = args;
  const greeting = adminName ? `Hi ${adminName},` : "Hallo,";
  const endsLabel = endsAt.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  const urgency =
    daysLeft <= 1
      ? "Morgen läuft euer Trial ab."
      : daysLeft <= 3
        ? `Nur noch ${daysLeft} Tage Trial.`
        : `In ${daysLeft} Tagen endet euer Trial.`;

  return {
    subject: `${urgency} · KickPact für ${clubName}`,
    text: `${greeting}

${urgency} Trial endet am ${endsLabel}.

Damit KickPact für ${clubName} ohne Unterbrechung weiterläuft, hinterlege bitte eine Zahlungsmethode:
${manageUrl}

Wenn ihr nicht weitermacht: alle Daten bleiben erhalten, ihr könnt jederzeit später wieder einsteigen.

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#F5F8F5; padding: 40px 20px; margin:0;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:14px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 26px; margin: 0 0 4px; color:#1A1A2E; font-weight: 800;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 28px; font-size: 14px;">Trial-Erinnerung</p>

      <h2 style="font-size: 20px; margin: 0 0 12px; color:#1A1A2E;">${urgency}</h2>
      <p style="color: #1A1A2E; margin: 0 0 16px; line-height: 1.6;">
        ${greeting} euer Trial für <strong>${clubName}</strong> endet am
        <strong>${endsLabel}</strong>.
      </p>

      <p style="color: #1A1A2E; margin: 0 0 24px; line-height: 1.6;">
        Damit alles ohne Unterbrechung weiterläuft (Match-Auswertung, PDF-Rechnungen,
        Sponsor-Pledges), hinterlege bitte eine Zahlungsmethode:
      </p>

      <a href="${manageUrl}" style="display:inline-block; background:#01C457; color:#fff; padding: 12px 24px; border-radius:10px; font-weight:700; text-decoration:none;">Abo aktivieren →</a>

      <p style="color:#525252; font-size: 14px; line-height: 1.6; margin: 24px 0 0;">
        Wenn ihr nicht weitermacht: alle Daten bleiben erhalten, ihr könnt jederzeit später
        wieder einsteigen. Es passiert nichts automatisch.
      </p>

      <p style="color: #a3a3a3; font-size: 11px; margin-top: 36px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        Bei Fragen: einfach auf diese Mail antworten.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
