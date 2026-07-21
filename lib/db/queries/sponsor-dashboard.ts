import { and, eq, gte, lte, asc, desc, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  charges,
  pledges,
  sponsors,
  teams,
  clubs,
  matches
} from "@/lib/db/schema";
import { saisonStartDate } from "@/lib/utils/saison";

export interface SponsorDashboardKpis {
  activePledgeCount: number;
  monthlyCents: number;
  biggestRecent: { amountCents: number; triggerType: string; createdAt: Date } | null;
  ytdCents: number;
  lastYearCents: number;
}

/**
 * KPI-Kacheln des Sponsor-Dashboards (/sponsor): aktive Pacts, Monats-Summe,
 * größter Einzel-Charge, Jahres-Total + Vorjahres-Vergleich. Cap-Auslastung
 * läuft separat über getCapUsageForActivePledges (sponsor-reporting).
 */
export async function getSponsorDashboardKpis(
  sponsorId: string,
  now: Date
): Promise<SponsorDashboardKpis> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const lastYearStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const lastYearEnd = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [activePledgeCount, monthlyCents, biggestRecent, yearStats] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pledges)
      .where(and(eq(pledges.sponsorId, sponsorId), eq(pledges.status, "active")))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      // Periodisierung + Status wie Bilanz/Cap/Rechnung: nur fälliges Geld
      // (confirmed|invoiced) im Confirm-Monat-Fenster [monthStart, monthEnd)
      // über COALESCE(confirmedAt, createdAt) — identisch zu getMonthlyChargedCents.
      .where(
        and(
          eq(pledges.sponsorId, sponsorId),
          inArray(charges.status, ["confirmed", "invoiced"]),
          sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${monthStart.toISOString()}`,
          sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) <  ${monthEnd.toISOString()}`
        )
      )
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({
        amountCents: charges.amountCents,
        triggerType: charges.triggerType,
        createdAt: charges.createdAt
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      // nur fälliges Geld (confirmed|invoiced) — ein cancelled/pending_approval
      // Charge war nie geschuldet und darf nicht als „größter Einzel-Charge"
      // auftauchen. Deckt sich mit monthlyCents/ytd + getSponsorBalance.
      .where(
        and(
          eq(pledges.sponsorId, sponsorId),
          inArray(charges.status, ["confirmed", "invoiced"])
        )
      )
      .orderBy(desc(charges.amountCents))
      .limit(1)
      .then((r) => r[0] ?? null),
    db
      .select({
        ytd: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
          WHERE COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${yearStart.toISOString()}
        ), 0)::int`,
        lastYear: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
          WHERE COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${lastYearStart.toISOString()}
            AND COALESCE(${charges.confirmedAt}, ${charges.createdAt}) <  ${lastYearEnd.toISOString()}
        ), 0)::int`
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(
        and(
          eq(pledges.sponsorId, sponsorId),
          inArray(charges.status, ["confirmed", "invoiced"]),
          sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${lastYearStart.toISOString()}`,
          sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) <  ${new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1)).toISOString()}`
        )
      )
      .then((r) => ({
        ytdCents: Number(r[0]?.ytd ?? 0),
        lastYearCents: Number(r[0]?.lastYear ?? 0)
      }))
  ]);

  return {
    activePledgeCount,
    monthlyCents,
    biggestRecent,
    ytdCents: yearStats.ytdCents,
    lastYearCents: yearStats.lastYearCents
  };
}

export interface SponsoredTeamMatch {
  id: string;
  datum: Date;
  heimName: string;
  gastName: string;
  /** fussball.de-team-id des Gegners, falls bekannt — für die Wappen-Auflösung. */
  heimTeamId: string | null;
  gastTeamId: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  status: string;
}

export interface SponsoredTeamMatches {
  teamId: string;
  teamName: string;
  clubName: string;
  /** Letztes abgeschlossenes Spiel der aktuellen Saison (oder null). */
  lastMatch: SponsoredTeamMatch | null;
  /** Nächstes angesetztes Spiel ab jetzt (oder null). */
  nextMatch: SponsoredTeamMatch | null;
}

const MATCH_COLS = {
  id: matches.id,
  datum: matches.datum,
  heimName: matches.heimName,
  gastName: matches.gastName,
  heimTeamId: matches.heimTeamId,
  gastTeamId: matches.gastTeamId,
  ergebnisHeim: matches.ergebnisHeim,
  ergebnisGast: matches.ergebnisGast,
  status: matches.status
};

/**
 * Spiele-Überblick für das Sponsor-Dashboard: pro Mannschaft mit aktivem Pledge
 * das letzte abgeschlossene + das nächste angesetzte Spiel. Gegen Alt-Saison-
 * Reste wird je Mannschaft am Saisonstart gegated (wie listMatchesForTeam).
 */
export async function getSponsoredTeamMatches(
  sponsorId: string,
  now: Date
): Promise<SponsoredTeamMatches[]> {
  // Mannschaften mit aktivem Pledge (distinct — ein Team kann mehrere Pledges haben).
  const sponsoredTeams = await db
    .selectDistinct({
      teamId: teams.id,
      teamName: teams.name,
      saison: teams.saison,
      clubName: clubs.name
    })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(eq(pledges.sponsorId, sponsorId), eq(pledges.status, "active")));

  return Promise.all(
    sponsoredTeams.map(async (t) => {
      const fromDate = saisonStartDate(t.saison);
      const seasonGate = fromDate ? [gte(matches.datum, fromDate)] : [];

      const [lastRows, nextRows] = await Promise.all([
        db
          .select(MATCH_COLS)
          .from(matches)
          .where(
            and(
              eq(matches.teamId, t.teamId),
              eq(matches.status, "finished"),
              lte(matches.datum, now),
              ...seasonGate
            )
          )
          .orderBy(desc(matches.datum))
          .limit(1),
        db
          .select(MATCH_COLS)
          .from(matches)
          .where(
            and(
              eq(matches.teamId, t.teamId),
              inArray(matches.status, ["scheduled", "live", "postponed"]),
              gte(matches.datum, now)
            )
          )
          .orderBy(asc(matches.datum))
          .limit(1)
      ]);

      return {
        teamId: t.teamId,
        teamName: t.teamName,
        clubName: t.clubName,
        lastMatch: lastRows[0] ?? null,
        nextMatch: nextRows[0] ?? null
      };
    })
  );
}

/**
 * Sponsor-Record für einen User finden (oder null).
 */
export async function findSponsorForUser(userId: string) {
  const [s] = await db
    .select()
    .from(sponsors)
    .where(eq(sponsors.userId, userId))
    .limit(1);
  return s ?? null;
}

/**
 * Legt ein Sponsor-Profil für einen User an und liefert die Sponsor-Row.
 *
 * Idempotent pro User (Race-Schutz, K1): zwei parallele Erst-Pact-Submits
 * sehen beide `findSponsorForUser === null` und landen hier gleichzeitig. Ohne
 * atomaren Upsert entstünden zwei Profile mit verschiedenen sponsorIds → der
 * Pledge-Idempotenz-Index greift nicht → Doppel-Abrechnung. `onConflictDoNothing`
 * am Unique-Index (sponsors.user_id) lässt nur EIN Profil entstehen; der
 * Verlierer bekommt keine Zeile zurück und löst über den Reselect dieselbe
 * stabile sponsorId auf.
 */
export async function createSponsorProfile(values: typeof sponsors.$inferInsert) {
  const [sponsor] = await db
    .insert(sponsors)
    .values(values)
    .onConflictDoNothing({ target: sponsors.userId })
    .returning();
  if (sponsor) return sponsor;
  const existing = await findSponsorForUser(values.userId);
  if (!existing) {
    // Unique-Konflikt ohne auffindbares Profil ist ein echter Invariant-Bruch.
    throw new Error("createSponsorProfile: user_id-Konflikt ohne bestehendes Profil");
  }
  return existing;
}

export interface SponsoredTeamRow {
  teamId: string;
  teamName: string;
  clubName: string;
  league: string | null;
  publicSlug: string | null;
  activePledges: number;
  totalPledges: number;
}

/**
 * Alle Mannschaften, die ein Sponsor (mind. einmal) sponsert — mit Pact-Zahlen,
 * sortiert nach aktiven Pacts. Treibt /sponsor/mannschaften.
 */
export async function listSponsoredTeamsForSponsor(
  sponsorId: string
): Promise<SponsoredTeamRow[]> {
  return db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      clubName: clubs.name,
      league: teams.league,
      publicSlug: teams.publicSlug,
      activePledges: sql<number>`count(*) FILTER (WHERE ${pledges.status} = 'active')::int`,
      totalPledges: sql<number>`count(*)::int`
    })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.sponsorId, sponsorId))
    .groupBy(teams.id, teams.name, clubs.name, teams.league, teams.publicSlug)
    .orderBy(desc(sql`count(*) FILTER (WHERE ${pledges.status} = 'active')`));
}
