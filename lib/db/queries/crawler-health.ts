import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, matches, teams } from "@/lib/db/schema";

/**
 * Crawler-Health overview for /admin/crawler.
 *
 * Per active team: when did we last crawl successfully? How many matches do
 * we have? A naive "Erfolgsrate" (% finished/total) is included as a sanity
 * signal — it's NOT actual crawler success/failure tracking (we don't yet
 * persist crawl-attempt rows; this is on the Plan-5 roadmap when we add the
 * match_drift_alerts table). Use this as a heuristic only.
 */
export interface CrawlerTeamHealth {
  teamId: string;
  teamName: string;
  saison: string;
  clubId: string;
  clubName: string;
  clubSlug: string;
  fussballdeTeamId: string | null;
  lastCrawledAt: Date | null;
  matchCount: number;
  finishedMatchCount: number;
  /** Rounded to integer percent. 0 if matchCount==0. */
  finishedPercent: number;
  lastError: string | null;
  lastErrorAt: Date | null;
}

export async function getCrawlerHealth(): Promise<CrawlerTeamHealth[]> {
  const rows = await db.execute<{
    teamId: string;
    teamName: string;
    saison: string;
    clubId: string;
    clubName: string;
    clubSlug: string;
    fussballdeTeamId: string | null;
    lastCrawledAt: Date | null;
    matchCount: number;
    finishedMatchCount: number;
    lastError: string | null;
    lastErrorAt: Date | null;
  }>(sql`
    SELECT
      t.id AS "teamId",
      t.name AS "teamName",
      t.saison AS "saison",
      t.club_id AS "clubId",
      c.name AS "clubName",
      c.slug AS "clubSlug",
      t.fussballde_team_id AS "fussballdeTeamId",
      t.crawl_last_error AS "lastError",
      t.crawl_last_error_at AS "lastErrorAt",
      (
        SELECT MAX(m.crawled_at)
        FROM matches m
        WHERE m.team_id = t.id
      ) AS "lastCrawledAt",
      (SELECT COUNT(*)::int FROM matches m WHERE m.team_id = t.id) AS "matchCount",
      (
        SELECT COUNT(*)::int FROM matches m
        WHERE m.team_id = t.id AND m.status = 'finished'
      ) AS "finishedMatchCount"
    FROM teams t
    INNER JOIN clubs c ON c.id = t.club_id
    WHERE t.is_active = true
      AND t.fussballde_team_id IS NOT NULL
    ORDER BY t.crawl_last_error_at DESC NULLS LAST, "lastCrawledAt" ASC NULLS FIRST, c.name ASC
  `);

  return rows.map((r) => {
    const matchCount = Number(r.matchCount);
    const finishedMatchCount = Number(r.finishedMatchCount);
    const finishedPercent =
      matchCount > 0 ? Math.round((finishedMatchCount / matchCount) * 100) : 0;
    return {
      teamId: r.teamId,
      teamName: r.teamName,
      saison: r.saison,
      clubId: r.clubId,
      clubName: r.clubName,
      clubSlug: r.clubSlug,
      fussballdeTeamId: r.fussballdeTeamId,
      lastCrawledAt: r.lastCrawledAt ? new Date(r.lastCrawledAt) : null,
      matchCount,
      finishedMatchCount,
      finishedPercent,
      lastError: r.lastError,
      lastErrorAt: r.lastErrorAt ? new Date(r.lastErrorAt) : null
    };
  });
}

/**
 * Last N matches inserted/updated by the crawler — chronological by
 * crawledAt. Lets ops eyeball whether the crawler is producing data.
 *
 * (Plan 4 deliberately doesn't add a match_drift_alerts table — too much
 * scope for an MVP-admin. We rely on the existing log-based observability
 * for actual scrape errors.)
 */
export interface RecentCrawlRow {
  matchId: string;
  fussballdeSpielId: string;
  teamId: string;
  teamName: string;
  clubName: string;
  heimName: string;
  gastName: string;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  status: string;
  crawledAt: Date;
}

export async function getRecentCrawls(limit = 20): Promise<RecentCrawlRow[]> {
  const rows = await db
    .select({
      matchId: matches.id,
      fussballdeSpielId: matches.fussballdeSpielId,
      teamId: matches.teamId,
      teamName: teams.name,
      clubName: clubs.name,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      status: matches.status,
      crawledAt: matches.crawledAt
    })
    .from(matches)
    .innerJoin(teams, eq(teams.id, matches.teamId))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .orderBy(desc(matches.crawledAt))
    .limit(limit);
  return rows;
}
