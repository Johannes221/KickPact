import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Cache der Vereinswappen von fussball.de, keyed auf die fussball.de-team-id.
 *
 * Der Crawler liest die Wappen-URL ohnehin aus jeder Spielplan-Zeile
 * ({@link extractCrestsFromRow}) — hier landet sie einmal heruntergeladen als
 * Storage-Objekt, damit Story-/Share-Bilder und die App echte Logos statt
 * Namens-Kürzel zeigen. Auch für GEGNER, die selbst keine KickPact-Mannschaft
 * sind (und deshalb keine `teams`-Zeile haben) — genau die tragen im Story-Bild
 * sonst nur ein „FCSD".
 *
 * Bewusst KEIN FK auf teams: der Key ist eine fussball.de-ID, viele Einträge
 * gehören zu Vereinen, die nie ein KickPact-Team anlegen. Reiner Cache;
 * Verwaisungen sind harmlos und werden vom nächsten Crawl überschrieben.
 *
 * `sourceUrl` ist die fussball.de-getLogo-URL. Sie enthält die Medien-ID des
 * Wappens; ändert der Verein sein Logo, ändert sich die ID → Re-Download. Steht
 * dieselbe URL schon drin, spart der Crawl den erneuten Download (ein Team
 * taucht in ~80 Zeilen/Saison auf, und der Cron läuft mehrmals täglich).
 */
export const clubCrests = pgTable("club_crests", {
  fussballdeTeamId: text("fussballde_team_id").primaryKey(),
  /** Storage-URL wie `teams.logoUrl` (r2:// bzw. local://). */
  logoUrl: text("logo_url").notNull(),
  /** fussball.de-getLogo-URL — Download-Guard (Medien-ID = Logo-Version). */
  sourceUrl: text("source_url").notNull(),
  /** Vereinsname aus der Spielplan-Zeile — nur fürs Debugging. */
  name: text("name"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow()
});
