/**
 * Sponsor-Referral-Links (Feature 1, v1).
 *
 * Ein Sponsor kann KickPact an andere Vereine weiterempfehlen — der Link führt
 * schlicht auf die Landing. Die persistente Attribution (welcher Verein kam über
 * welchen Sponsor) folgt mit Feature 2 (`referrals`-Tabelle); erst dann bekommt
 * der Link einen Tracking-Param — dann als opaker Code, nicht als rohe sponsorId.
 *
 * Pure (kein DB/Window) → unit-testbar.
 */

/** Baut den teilbaren Empfehlungs-Link auf die Verein-Landing. */
export function buildReferralShareUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/`;
}

/** Vorgefüllter Teilen-Text fürs Share-Sheet / WhatsApp. */
export function referralShareText(url: string): string {
  return `Wir sammeln mit KickPact Sponsoring fürs Team — pro Tor, pro Sieg, ganz automatisch. Vielleicht was für euch? ${url}`;
}
