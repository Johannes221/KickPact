import type { MorningBriefingData } from "@/lib/db/queries/morning-briefing";

function eur(cents: number): string {
  // Glatte Euro-Beträge ohne Nachkommastellen (8.091 €), sonst genau zwei
  // (45,50 € — nicht 45,5 €).
  const digits = cents % 100 === 0 ? 0 : 2;
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

/**
 * Tägliches internes Plattform-Briefing an die Operatoren. Zwei Blöcke:
 * „Neu (24h)" = Zuwachs seit gestern, „Bestand" = aktuelle Gesamtzahlen.
 * Rein interne Mail (kein Kunden-Wording), darum Klartext-Kennzahlen.
 */
export function morningBriefingEmail(args: {
  data: MorningBriefingData;
  dateLabel: string;
  dashboardUrl: string;
}): { subject: string; html: string; text: string } {
  const { data, dateLabel, dashboardUrl } = args;
  const { neu, bestand } = data;

  const neuRows: Array<[string, string]> = [
    ["Neue Nutzer", `+${neu.users}`],
    ["Neue Vereine", `+${neu.clubs}`],
    ["Neue Mannschaften", `+${neu.teams}`],
    ["Neue Abos (Trial-Starts)", `+${neu.subscriptions}`],
    ["Neu aktivierte Lizenzen (Verkäufe)", `+${neu.activatedLicenses}`],
    ["Beiträge generiert", `${neu.chargesCount} · ${eur(neu.chargesCents)}`]
  ];

  const bestandRows: Array<[string, string]> = [
    ["Nutzer gesamt", `${bestand.users}`],
    ["Vereine gesamt", `${bestand.clubs}`],
    ["Aktive Mannschaften", `${bestand.activeTeams}`],
    ["Zahlende Abos", `${bestand.activeSubscriptions}`],
    ["Laufende Trials", `${bestand.trialingSubscriptions}`],
    ["MRR", eur(bestand.mrrCents)],
    ["Trial→Paid (30 T.)", `${bestand.trialToPaidPercent} %`],
    ["Churn (30 T.)", `${bestand.churnPercent} %`]
  ];

  const subject = `☀️ KickPact-Briefing ${dateLabel} · +${neu.users} Nutzer · +${neu.teams} Teams · +${neu.activatedLicenses} Verkäufe`;

  const textBlock = (title: string, rows: Array<[string, string]>) =>
    [`${title}:`, ...rows.map(([k, v]) => `  • ${k}: ${v}`)].join("\n");

  const text = [
    `KickPact – Morgen-Briefing (${dateLabel})`,
    "",
    textBlock("Neu (letzte 24 h)", neuRows),
    "",
    textBlock("Bestand", bestandRows),
    "",
    `Dashboard: ${dashboardUrl}`
  ].join("\n");

  const htmlRows = (rows: Array<[string, string]>) =>
    rows
      .map(
        ([k, v]) =>
          `<tr>
            <td style="padding:8px 0; border-bottom:1px solid #eee; color:#525252;">${k}</td>
            <td style="padding:8px 0; border-bottom:1px solid #eee; text-align:right; font-weight:700; color:#171717;">${v}</td>
          </tr>`
      )
      .join("");

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 560px; margin: 0 auto; background:#fff; border-radius:12px; padding: 32px;">
    <tr><td>
      <p style="text-transform:uppercase; letter-spacing:2px; font-size:12px; font-weight:600; color:#a3a3a3; margin:0 0 8px;">KickPact Operator</p>
      <h1 style="font-size: 20px; margin: 0 0 4px;">☀️ Morgen-Briefing</h1>
      <p style="color:#a3a3a3; margin:0 0 24px; font-size:13px;">${dateLabel}</p>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#FF5722; margin:0 0 8px;">Neu · letzte 24 h</h2>
      <table style="width:100%; border-collapse:collapse; margin:0 0 24px;">${htmlRows(neuRows)}</table>

      <h2 style="font-size:13px; text-transform:uppercase; letter-spacing:1px; color:#171717; margin:0 0 8px;">Bestand</h2>
      <table style="width:100%; border-collapse:collapse;">${htmlRows(bestandRows)}</table>

      <p style="margin:24px 0 0;"><a href="${dashboardUrl}" style="display:inline-block; background:#FF5722; color:#fff; text-decoration:none; padding:12px 24px; border-radius:8px; font-weight:600;">Zum Dashboard</a></p>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}
