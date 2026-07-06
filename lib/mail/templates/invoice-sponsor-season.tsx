/**
 * Saisonende-Rechnungs-Mail an den Sponsor (Paket A.4, Spec §1.2).
 * Pattern: lib/mail/templates/invoice-sponsor.tsx (Monats-Mail) — gleiche
 * Struktur, Saison-Copy: alle gesammelten Beiträge der Saison auf EINER
 * Rechnung am Saisonende (30.06.).
 */
export function invoiceSponsorSeasonEmail(args: {
  sponsorName: string;
  clubName: string;
  /** Saison-Label, z.B. "Saison 2025/26". */
  period: string;
  totalEur: string;
  invoiceNumber: string;
  itemCount: number;
}): { subject: string; html: string; text: string } {
  const { sponsorName, clubName, period, totalEur, invoiceNumber, itemCount } = args;

  return {
    subject: `Deine KickPact-Saison-Zahlungsübersicht ${invoiceNumber} · ${period}`,
    text: `Hi ${sponsorName},

die ${period} ist vorbei — hier kommt deine Saison-Zahlungsübersicht: ${itemCount} Beiträge aus der ganzen Saison, Gesamt ${totalEur}.

Beleg-Nr.: ${invoiceNumber}
Mannschaft: ${clubName}

Du hast Saisonende-Abrechnung gewählt: Alle Beiträge der Saison stehen gesammelt auf dieser einen Zahlungsübersicht.

Die PDF findest du im Anhang. Der Verein wird sie dir auch separat per Mail schicken.

Tipp: Banking-App auf, QR-Code auf der Übersicht scannen — fertig.

Vielen Dank, dass du die Mannschaft die ganze Saison unterstützt hast!

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#F5F8F5; padding: 40px 20px; margin:0;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:14px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 26px; margin: 0 0 4px; color:#1A1A2E; font-weight: 800;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 28px; font-size: 14px;">Performance-Sponsoring im Amateurfußball</p>

      <h2 style="font-size: 20px; margin: 0 0 8px; color:#1A1A2E;">Hi ${sponsorName},</h2>
      <p style="color: #1A1A2E; margin: 0 0 16px; line-height: 1.6;">
        die <strong>${period}</strong> ist vorbei — hier kommt deine Saison-Zahlungsübersicht:
        ${itemCount} bestätigte Beiträge aus der ganzen Saison für <strong>${clubName}</strong>.
      </p>

      <table style="width:100%; background:#F5F8F5; border-radius:10px; padding: 18px; margin: 16px 0 24px;">
        <tr><td style="color:#525252; font-size: 13px;">Gesamt</td><td style="text-align:right; font-size: 22px; font-weight: 800; color:#01C457;">${totalEur}</td></tr>
        <tr><td colspan="2" style="font-size: 12px; color:#a3a3a3; padding-top: 8px;">Beleg-Nr. ${invoiceNumber}</td></tr>
      </table>

      <p style="color:#525252; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Du hast Saisonende-Abrechnung gewählt: Alle Beiträge der Saison stehen gesammelt
        auf dieser einen Zahlungsübersicht. Die PDF findest du im Anhang — bitte überweise den
        Betrag innerhalb von 14 Tagen an den Verein, die Bankverbindung steht auf der Übersicht.
      </p>

      <p style="color:#525252; font-size: 13px; line-height: 1.6; margin: 0 0 24px; padding: 10px 14px; background:#F5F8F5; border-radius:8px;">
        <strong style="color:#1A1A2E;">Tipp:</strong> Banking-App auf, QR-Code im Anhang scannen — fertig.
      </p>

      <p style="color:#1A1A2E; font-size: 14px; line-height: 1.6;">
        Danke, dass du die Mannschaft die ganze Saison unterstützt hast! 💚
      </p>

      <p style="color: #a3a3a3; font-size: 11px; margin-top: 36px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        KickPact bleibt zwischen Verein und Sponsor — wir leiten kein Geld weiter. Bezahlung direkt an den Verein.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
