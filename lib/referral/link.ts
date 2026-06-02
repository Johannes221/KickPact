/**
 * Sponsor-Referral-Links (Feature 1, v1).
 *
 * Ein Sponsor kann KickPact an andere Vereine weiterempfehlen. Der Link trägt
 * die `sponsorId` als `?ref=`-Param mit — in v1 rein zum Teilen/Verbreiten
 * gedacht; die persistente Attribution (welcher Verein kam über welchen Sponsor)
 * folgt mit Feature 2 (`referrals`-Tabelle). Der Param ist bis dahin harmlos.
 *
 * Pure (kein DB/Window) → unit-testbar.
 */

/** Baut den teilbaren Empfehlungs-Link eines Sponsors auf die Verein-Landing. */
export function buildReferralShareUrl(baseUrl: string, sponsorId: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return `${base}/?ref=${encodeURIComponent(sponsorId)}`;
}

/** Vorgefüllter Teilen-Text fürs Share-Sheet / WhatsApp. */
export function referralShareText(url: string): string {
  return `Wir sammeln mit KickPact Sponsoring fürs Team — pro Tor, pro Sieg, ganz automatisch. Vielleicht was für euch? ${url}`;
}
