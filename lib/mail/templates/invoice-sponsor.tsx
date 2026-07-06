import { paypalMeUrl } from "@/lib/invoicing/payment-options";

export function invoiceSponsorEmail(args: {
  sponsorName: string;
  clubName: string;
  teamName?: string;
  period: string;
  totalEur: string;
  invoiceNumber: string;
  itemCount: number;
  /**
   * Spec §1.9 (Phase 5): optionale Zusatz-Zahlwege des Vereins. Erscheinen —
   * sofern gesetzt — als eigener Block unter dem Überweisungs-Hinweis.
   * Einbau-Stelle: generate-invoices.ts muss `clubs.paypalHandle` /
   * `clubs.stripePaymentLink` aus der Club-Row durchreichen.
   */
  paypalHandle?: string | null;
  stripePaymentLink?: string | null;
}): { subject: string; html: string; text: string } {
  const { sponsorName, clubName, period, totalEur, invoiceNumber, itemCount } = args;

  const payLinkTextLines: string[] = [];
  if (args.paypalHandle) {
    payLinkTextLines.push(`PayPal: ${paypalMeUrl(args.paypalHandle)}`);
  }
  if (args.stripePaymentLink) {
    payLinkTextLines.push(`Online zahlen: ${args.stripePaymentLink}`);
  }
  const payLinksText =
    payLinkTextLines.length > 0
      ? `\n\nAlternativ kannst du auch direkt online zahlen:\n${payLinkTextLines.join("\n")}\n`
      : "";
  const payLinksHtml =
    payLinkTextLines.length > 0
      ? `
      <p style="color:#525252; font-size: 13px; line-height: 1.8; margin: 0 0 16px; padding: 10px 14px; background:#F5F8F5; border-radius:8px;">
        <strong style="color:#1A1A2E;">Alternativ direkt online zahlen:</strong><br/>
        ${[
          args.paypalHandle
            ? `PayPal: <a href="${paypalMeUrl(args.paypalHandle)}" style="color:#01C457;">${paypalMeUrl(args.paypalHandle)}</a>`
            : null,
          args.stripePaymentLink
            ? `Karte/Online: <a href="${args.stripePaymentLink}" style="color:#01C457;">${args.stripePaymentLink}</a>`
            : null
        ]
          .filter(Boolean)
          .join("<br/>")}
      </p>`
      : "";

  return {
    subject: `Deine KickPact-Zahlungsübersicht ${invoiceNumber} · ${period}`,
    text: `Hi ${sponsorName},

deine Zahlungsübersicht für ${period} ist da: ${itemCount} Spielereignisse, Gesamt ${totalEur}.

Beleg-Nr.: ${invoiceNumber}
Mannschaft: ${clubName}

Die PDF findest du im Anhang. Der Verein wird sie dir auch separat per Mail schicken.
${payLinksText}
Tipp: Banking-App auf, QR-Code auf der Übersicht scannen — fertig.

Vielen Dank, dass du die Mannschaft unterstützt!

— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#F5F8F5; padding: 40px 20px; margin:0;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:14px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 26px; margin: 0 0 4px; color:#1A1A2E; font-weight: 800;">KickPact</h1>
      <p style="color: #525252; margin: 0 0 28px; font-size: 14px;">Performance-Sponsoring im Amateurfußball</p>

      <h2 style="font-size: 20px; margin: 0 0 8px; color:#1A1A2E;">Hi ${sponsorName},</h2>
      <p style="color: #1A1A2E; margin: 0 0 16px; line-height: 1.6;">
        deine Zahlungsübersicht für <strong>${period}</strong> ist da — ${itemCount} bestätigte Spielereignisse für <strong>${clubName}</strong>.
      </p>

      <table style="width:100%; background:#F5F8F5; border-radius:10px; padding: 18px; margin: 16px 0 24px;">
        <tr><td style="color:#525252; font-size: 13px;">Gesamt</td><td style="text-align:right; font-size: 22px; font-weight: 800; color:#01C457;">${totalEur}</td></tr>
        <tr><td colspan="2" style="font-size: 12px; color:#a3a3a3; padding-top: 8px;">Beleg-Nr. ${invoiceNumber}</td></tr>
      </table>

      <p style="color:#525252; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Die PDF findest du im Anhang. Bitte überweise den Betrag innerhalb von 14 Tagen an den Verein —
        Bankverbindung steht auf der Übersicht.
      </p>
${payLinksHtml}
      <p style="color:#525252; font-size: 13px; line-height: 1.6; margin: 0 0 24px; padding: 10px 14px; background:#F5F8F5; border-radius:8px;">
        <strong style="color:#1A1A2E;">Tipp:</strong> Banking-App auf, QR-Code im Anhang scannen — fertig.
      </p>

      <p style="color:#1A1A2E; font-size: 14px; line-height: 1.6;">
        Danke, dass du die Mannschaft unterstützt! 💚
      </p>

      <p style="color: #a3a3a3; font-size: 11px; margin-top: 36px; border-top: 1px solid #e5e5e5; padding-top: 16px;">
        KickPact bleibt zwischen Verein und Sponsor — wir leiten kein Geld weiter. Bezahlung direkt an den Verein.
      </p>
    </td></tr>
  </table>
</body></html>`
  };
}
