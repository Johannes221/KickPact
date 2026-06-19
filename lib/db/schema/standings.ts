import { pgTable, text, jsonb, timestamp, primaryKey } from "drizzle-orm/pg-core";
import type { LeagueStandings } from "@/lib/crawler/fussballde";

/**
 * Persistierte Liga-Tabelle pro (Mannschaft, Saison) — Cache für die
 * verifizierten Voll-Saison-Aggregate des Saison-Wrapped.
 *
 * Warum persistiert statt on-demand: der Tabellen-Scrape braucht einen echten
 * Browser (ajax.team.table blockt plain fetch) und dauert ~5 s. Im Request-Pfad
 * (Wrapped-Seite/og-Bild) wäre das untragbar. Der Crawl befüllt diese Tabelle
 * 1×/Tag im Browser-Kontext; das Wrapped LIEST nur (instant, kein Browser).
 *
 * `data` ist das komplette {@link LeagueStandings}-Objekt (inkl. aller Zeilen
 * für die „gegen Top-3"-Auswertung). Bewusst KEIN FK auf teams: reiner Cache,
 * Verwaisungen sind harmlos und werden vom nächsten Crawl überschrieben.
 */
export const teamStandings = pgTable(
  "team_standings",
  {
    teamId: text("team_id").notNull(),
    saison: text("saison").notNull(),
    data: jsonb("data").$type<LeagueStandings>().notNull(),
    scrapedAt: timestamp("scraped_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.teamId, t.saison] })
  })
);
