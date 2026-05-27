export function trialExpiredEmail(args: {
  clubName: string;
  aboUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, aboUrl } = args;

  return {
    subject: `Trial für ${clubName} abgelaufen — jetzt Plan wählen`,
    text: `Hallo,

dein KickPact-Trial für ${clubName} ist heute abgelaufen.

Damit die Plattform weiter läuft und Sponsor-Charges erzeugt werden,
wähle bitte einen Plan im Abo-Dashboard:
${aboUrl}

Bis zum Plan-Abschluss ist die Mannschaft auf Read-Only — Crawler,
Charge-Erzeugung und PDF-Versand pausieren.

Wenn ihr nicht weitermacht: alle Daten bleiben 90 Tage erhalten,
ihr könnt jederzeit wieder einsteigen.

Bei Fragen einfach auf diese Mail antworten.

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#F5F8F5; padding: 40px 20px; margin:0;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:14px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 26px; margin: 0 0 4px; color:#1A1A2E; font-weight: 800;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 28px; font-size: 14px;">Trial abgelaufen</p>

      <h2 style="font-size: 20px; margin: 0 0 12px; color:#1A1A2E;">Euer Trial ist abgelaufen.</h2>
      <p style="color: #1A1A2E; margin: 0 0 16px; line-height: 1.6;">
        Der kostenlose Test-Zeitraum für <strong>${clubName}</strong> ist heute
        abgelaufen.
      </p>

      <p style="color: #1A1A2E; margin: 0 0 8px; line-height: 1.6;">
        Bis ihr einen Plan wählt, ist die Mannschaft auf Read-Only gestellt:
      </p>
      <ul style="margin: 0 0 24px; padding-left: 20px; color: #525252; line-height: 1.8; font-size: 14px;">
        <li>Crawler pausiert — keine neuen Spiel-Events</li>
        <li>Charge-Erzeugung gestoppt — Sponsoren werden nicht belastet</li>
        <li>PDF-Versand ausgesetzt</li>
      </ul>

      <a href="${aboUrl}" style="display:inline-block; background:#01C457; color:#fff; padding: 12px 24px; border-radius:10px; font-weight:700; text-decoration:none;">Jetzt Abo wählen →</a>

      <p style="color:#525252; font-size: 14px; line-height: 1.6; margin: 24px 0 0;">
        Wenn ihr nicht weitermacht: alle Daten bleiben 90 Tage erhalten, ihr
        könnt jederzeit später wieder einsteigen. Es passiert nichts automatisch.
      </p>

      <p style="color: #a3a3a3; font-size: 11px; margin-top: 36px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        Bei Fragen: einfach auf diese Mail antworten.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
