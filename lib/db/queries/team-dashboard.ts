import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, pledges, charges, sponsors, users, teams } from "@/lib/db/schema";
import { sponsorLabelSql } from "./sponsor-label";
import { resolveTeamSide } from "@/lib/crawler/team-side";
import { saisonStartDate } from "@/lib/utils/saison";

export interface TeamSponsorRow {
  sponsorId: string;
  displayName: string;
  /** Aktive Pacts (pledges.status='active') dieses Sponsors auf der Mannschaft. */
  activePacts: number;
  /** Alle Pacts (jeder Status). */
  totalPacts: number;
  /** Bestätigte/abgerechnete Charges-Summe dieses Sponsors auf der Mannschaft. */
  chargedCents: number;
}

/**
 * Alle Sponsoren EINER Mannschaft (für den Sponsoren-Tab) — inkl. Sponsoren, die
 * zwar einen Pact haben, aber noch keine Charges. Sortiert: aktive Pacts zuerst,
 * dann nach abgerechnetem Betrag.
 */
export async function listSponsorsForTeam(teamId: string): Promise<TeamSponsorRow[]> {
  const rows = await db
    .select({
      sponsorId: sponsors.id,
      displayName: sponsorLabelSql,
      activePacts: sql<number>`count(*) FILTER (WHERE ${pledges.status} = 'active')::int`,
      totalPacts: sql<number>`count(*)::int`,
      chargedCents: sql<number>`COALESCE(SUM((
        SELECT SUM(c.amount_cents) FROM ${charges} c
        WHERE c.pledge_id = ${pledges.id} AND c.status IN ('confirmed','invoiced')
      )), 0)::int`
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .where(eq(pledges.teamId, teamId))
    .groupBy(sponsors.id, sponsors.displayName, users.name, users.email)
    .orderBy(
      sql`count(*) FILTER (WHERE ${pledges.status} = 'active') DESC, COALESCE(SUM((
        SELECT SUM(c.amount_cents) FROM ${charges} c
        WHERE c.pledge_id = ${pledges.id} AND c.status IN ('confirmed','invoiced')
      )), 0) DESC`
    );

  return rows.map((r) => ({
    sponsorId: r.sponsorId,
    displayName: r.displayName,
    activePacts: Number(r.activePacts ?? 0),
    totalPacts: Number(r.totalPacts ?? 0),
    chargedCents: Number(r.chargedCents ?? 0)
  }));
}

// ---------------- Season Stats ----------------

export interface TeamSeasonStats {
  games: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number;
}

/** Bilanz/Tore aus abgeschlossenen Matches. Heim/Auswärts robust über
 *  Team- + Vereinsname (vgl. ursprüngliche Inline-Logik der Dashboard-Seite).
 *
 *  Aufs AKTUELLE Saison-Fenster beschränkt (datum >= saisonStartDate der
 *  Team-Row, analog Display-Gate in listMatchesForTeam): der Vorsaison-
 *  Backfill (backfill-team-history) legt finished-Rows mit Ergebnis aus der
 *  Vorsaison auf derselben Team-Row an — ohne Fenster würden Dashboard-Stats
 *  und öffentliches Profil Vorsaison + aktuelle Saison zusammenzählen. */
export async function computeTeamSeasonStats(
  teamId: string, teamName: string, clubName: string
): Promise<TeamSeasonStats> {
  const [t] = await db
    .select({ saison: teams.saison, fussballdeTeamId: teams.fussballdeTeamId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const fromDate = t ? saisonStartDate(t.saison) : null;
  const conditions = [eq(matches.teamId, teamId)];
  if (fromDate) conditions.push(gte(matches.datum, fromDate));
  const rows = await db.select().from(matches).where(and(...conditions));
  const finished = rows.filter((m) => m.status === "finished" && m.ergebnisHeim !== null);
  const names = [teamName, clubName];
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  for (const m of finished) {
    const isHeim =
      resolveTeamSide(m, t?.fussballdeTeamId ?? null, names) === "heim";
    const gF = isHeim ? (m.ergebnisHeim ?? 0) : (m.ergebnisGast ?? 0);
    const gA = isHeim ? (m.ergebnisGast ?? 0) : (m.ergebnisHeim ?? 0);
    goalsFor += gF; goalsAgainst += gA;
    if (gF > gA) wins++; else if (gF < gA) losses++; else draws++;
  }
  return { games: finished.length, wins, draws, losses, goalsFor, goalsAgainst };
}
