import { and, eq, inArray, desc, sql, countDistinct, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  pledges,
  pledgeRules,
  sponsors,
  charges,
  matches,
  matchEvents,
  seasonResults,
  users
} from "@/lib/db/schema";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import { sponsorLabelSql } from "./sponsor-label";
import { isTriggerHit } from "@/lib/inngest/functions/evaluate-season";
import type { SeasonTriggerType } from "@/lib/db/schema/pledges";

/**
 * Aggregierte Live-Stats für das Vereins-Dashboard.
 *
 * - activeSponsors: distinct sponsor count via active pledges
 * - activePledges: count of pledges with status='active'
 * - totalChargesSeasonCents: SUM(amountCents) charges status='confirmed'
 *   für die aktuelle Saison
 * - accruedMannschaftskasseCents: confirmed + invoiced charges (also der
 *   gesamte aufgelaufene Topf, der schon abgerechnet wurde oder noch wird).
 */
export interface ClubDashboardStats {
  teamCount: number;
  activeSponsors: number;
  activePledges: number;
  totalChargesSeasonCents: number;
  accruedMannschaftskasseCents: number;
}

export async function getClubDashboardStats(clubId: string): Promise<ClubDashboardStats> {
  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, clubId));

  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) {
    return {
      teamCount: 0,
      activeSponsors: 0,
      activePledges: 0,
      totalChargesSeasonCents: 0,
      accruedMannschaftskasseCents: 0
    };
  }

  const [sponsorAgg] = await db
    .select({
      activeSponsors: countDistinct(pledges.sponsorId),
      activePledges: sql<number>`COUNT(*)::int`
    })
    .from(pledges)
    .where(and(inArray(pledges.teamId, teamIds), eq(pledges.status, "active")));

  const [chargeAgg] = await db
    .select({
      totalConfirmed: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (WHERE ${charges.status} = 'confirmed'), 0)::int`,
      accrued: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (WHERE ${charges.status} IN ('confirmed','invoiced')), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(inArray(pledges.teamId, teamIds));

  return {
    teamCount: teamRows.length,
    activeSponsors: Number(sponsorAgg?.activeSponsors ?? 0),
    activePledges: Number(sponsorAgg?.activePledges ?? 0),
    totalChargesSeasonCents: Number(chargeAgg?.totalConfirmed ?? 0),
    accruedMannschaftskasseCents: Number(chargeAgg?.accrued ?? 0)
  };
}

export interface ClubPledgeRow {
  pledgeId: string;
  sponsorId: string;
  sponsorDisplayName: string;
  sponsorEmail: string;
  teamId: string;
  teamName: string;
  triggerType: string;
  triggerScope: "match" | "season";
  amountCents: number;
  chargedCents: number;
  status: "active" | "paused" | "ended";
}

export interface PageInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedPledges {
  rows: ClubPledgeRow[];
  page: PageInfo;
}

export interface ListClubPledgesArgs {
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * Listet alle Sponsor-Wetten (pledges + ihre rules) quer durch die Mannschaften
 * eines Vereins, paginiert. Pro Pledge-Rule eine Zeile, mit dem bisher
 * aufgelaufenen Charge-Volumen (confirmed + invoiced).
 *
 * Sortiert nach pledge.createdAt DESC (neueste zuerst).
 *
 * Default-Pagesize 25. `page` ist 1-indiziert.
 */
export async function listClubPledges(
  clubId: string,
  args: ListClubPledgesArgs = {}
): Promise<PaginatedPledges> {
  const pageSize = Math.max(1, args.pageSize ?? DEFAULT_PAGE_SIZE);
  const requestedPage = Math.max(1, Math.floor(args.page ?? 1));

  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, clubId));
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) {
    return {
      rows: [],
      page: { page: 1, pageSize, total: 0, totalPages: 0 }
    };
  }

  const [countRow] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(inArray(pledges.teamId, teamIds));
  const total = Number(countRow?.count ?? 0);
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  // Clamp the page to the valid range so a stale ?page=99 does not return an
  // empty result silently.
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const offset = (page - 1) * pageSize;

  const rows = await db
    .select({
      pledgeId: pledges.id,
      pledgeStatus: pledges.status,
      sponsorId: sponsors.id,
      sponsorDisplayName: sponsorLabelSql,
      sponsorEmail: users.email,
      teamId: teams.id,
      teamName: teams.name,
      ruleId: pledgeRules.id,
      triggerType: pledgeRules.triggerType,
      amountCents: pledgeRules.amountCents,
      chargedCents: sql<number>`COALESCE((
        SELECT SUM(c.amount_cents)
        FROM ${charges} c
        WHERE c.pledge_id = ${pledges.id}
          AND c.pledge_rule_id = ${pledgeRules.id}
          AND c.status IN ('confirmed','invoiced')
      ), 0)::int`
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(inArray(pledges.teamId, teamIds))
    .orderBy(desc(pledges.createdAt))
    .limit(pageSize)
    .offset(offset);

  const mapped: ClubPledgeRow[] = rows.map((r) => ({
    pledgeId: r.pledgeId,
    sponsorId: r.sponsorId,
    sponsorDisplayName: r.sponsorDisplayName,
    sponsorEmail: r.sponsorEmail,
    teamId: r.teamId,
    teamName: r.teamName,
    triggerType: r.triggerType,
    triggerScope: isSeasonTrigger(r.triggerType) ? "season" : "match",
    amountCents: r.amountCents,
    chargedCents: Number(r.chargedCents ?? 0),
    status: r.pledgeStatus
  }));

  return {
    rows: mapped,
    page: { page, pageSize, total, totalPages }
  };
}

export interface ClubMatchRow {
  matchId: string;
  teamId: string;
  teamName: string;
  datum: Date;
  heimName: string;
  gastName: string;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  status: "scheduled" | "live" | "finished" | "cancelled" | "postponed";
  chargesCount: number;
  chargesSumCents: number;
}

/**
 * Letzte N ausgewertete (finished) Matches eines Vereins quer durch alle Mannschaften.
 * Liefert die Anzahl der erzeugten Charges + Summe pro Match.
 */
export async function listRecentClubMatches(
  clubId: string,
  limit = 10
): Promise<ClubMatchRow[]> {
  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, clubId));
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return [];

  const rows = await db
    .select({
      matchId: matches.id,
      teamId: matches.teamId,
      teamName: teams.name,
      datum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      status: matches.status,
      chargesCount: sql<number>`COALESCE((
        SELECT COUNT(*) FROM ${charges} c
        WHERE c.match_id = ${matches.id}
          AND c.status IN ('confirmed','invoiced')
      ), 0)::int`,
      chargesSumCents: sql<number>`COALESCE((
        SELECT SUM(c.amount_cents) FROM ${charges} c
        WHERE c.match_id = ${matches.id}
          AND c.status IN ('confirmed','invoiced')
      ), 0)::int`
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .where(and(inArray(matches.teamId, teamIds), eq(matches.status, "finished")))
    .orderBy(desc(matches.datum))
    .limit(limit);

  return rows.map((r) => ({
    matchId: r.matchId,
    teamId: r.teamId,
    teamName: r.teamName,
    datum: r.datum,
    heimName: r.heimName,
    gastName: r.gastName,
    ergebnisHeim: r.ergebnisHeim,
    ergebnisGast: r.ergebnisGast,
    status: r.status,
    chargesCount: Number(r.chargesCount ?? 0),
    chargesSumCents: Number(r.chargesSumCents ?? 0)
  }));
}

export type SeasonPledgeOutcome = "fulfilled" | "missed" | "pending";

export interface ClubSeasonPledgeRow {
  pledgeId: string;
  ruleId: string;
  sponsorDisplayName: string;
  teamId: string;
  teamName: string;
  teamSaison: string;
  triggerType: SeasonTriggerType;
  triggerParams: Record<string, unknown>;
  amountCents: number;
  outcome: SeasonPledgeOutcome;
}

/**
 * Aktive Saison-Wetten quer durch den Verein. Wenn season_results für die Saison
 * der Mannschaft existieren, wird `outcome` auf "fulfilled" oder "missed" gesetzt,
 * sonst "pending".
 */
export async function listClubSeasonPledges(
  clubId: string
): Promise<ClubSeasonPledgeRow[]> {
  const teamRows = await db
    .select({ id: teams.id, name: teams.name, saison: teams.saison })
    .from(teams)
    .where(eq(teams.clubId, clubId));
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map((t) => t.id);

  const rules = await db
    .select({
      pledgeId: pledges.id,
      ruleId: pledgeRules.id,
      sponsorDisplayName: sponsorLabelSql,
      teamId: teams.id,
      teamName: teams.name,
      teamSaison: teams.saison,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(and(inArray(pledges.teamId, teamIds), eq(pledges.status, "active")));

  const seasonRules = rules.filter((r) => isSeasonTrigger(r.triggerType));
  if (seasonRules.length === 0) return [];

  // Lade alle saison-results für die Team/Saison-Kombinationen, die wir brauchen.
  const results = await db
    .select()
    .from(seasonResults)
    .where(inArray(seasonResults.teamId, teamIds));

  const resultMap = new Map<string, typeof seasonResults.$inferSelect>();
  for (const r of results) {
    resultMap.set(`${r.teamId}|${r.saison}`, r);
  }

  return seasonRules.map((r) => {
    const key = `${r.teamId}|${r.teamSaison}`;
    const result = resultMap.get(key) ?? null;
    let outcome: SeasonPledgeOutcome = "pending";
    if (result) {
      const hit = isTriggerHit(
        r.triggerType as SeasonTriggerType,
        (r.triggerParams ?? {}) as Record<string, unknown>,
        result
      );
      outcome = hit ? "fulfilled" : "missed";
    }
    return {
      pledgeId: r.pledgeId,
      ruleId: r.ruleId,
      sponsorDisplayName: r.sponsorDisplayName,
      teamId: r.teamId,
      teamName: r.teamName,
      teamSaison: r.teamSaison,
      triggerType: r.triggerType as SeasonTriggerType,
      triggerParams: (r.triggerParams ?? {}) as Record<string, unknown>,
      amountCents: r.amountCents,
      outcome
    };
  });
}

export interface ClubMonthlyChargesPoint {
  /** "YYYY-MM" */
  month: string;
  cents: number;
}

/**
 * Monatliche Charges-Summe (confirmed+invoiced) der letzten N Monate eines Vereins,
 * aggregiert über alle Mannschaften. Liefert immer N Punkte (fehlende Monate → 0).
 */
export async function getMonthlyChargesForClub(
  clubId: string,
  monthsBack = 12
): Promise<ClubMonthlyChargesPoint[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId));
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) {
    return buildEmptyMonthlySeries(monthsBack);
  }

  const rows = await db
    .select({
      month: sql<string>`to_char(${charges.createdAt}, 'YYYY-MM')`,
      cents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        inArray(pledges.teamId, teamIds),
        inArray(charges.status, ["confirmed", "invoiced"]),
        gte(charges.createdAt, start)
      )
    )
    .groupBy(sql`to_char(${charges.createdAt}, 'YYYY-MM')`);

  const map = new Map(rows.map((r) => [r.month, Number(r.cents)]));
  const out: ClubMonthlyChargesPoint[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, cents: map.get(key) ?? 0 });
  }
  return out;
}

function buildEmptyMonthlySeries(monthsBack: number): ClubMonthlyChargesPoint[] {
  const now = new Date();
  const out: ClubMonthlyChargesPoint[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, cents: 0 });
  }
  return out;
}

export interface TopSponsorRow {
  sponsorId: string;
  displayName: string;
  totalCents: number;
}

/**
 * Top-N Sponsoren eines Vereins nach Charge-Volumen.
 *
 * `opts.seasonOnly` (default true) filtert auf charges des laufenden
 * Saison-Jahres (Juli–Juni-Heuristik). `false` für all-time.
 */
export async function getTopSponsorsForClub(
  clubId: string,
  limit = 5,
  opts: { seasonOnly?: boolean } = {}
): Promise<TopSponsorRow[]> {
  const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, clubId));
  const teamIds = teamRows.map((t) => t.id);
  if (teamIds.length === 0) return [];

  const now = new Date();
  const isAfterJuly = now.getMonth() >= 6;
  const seasonStartYear = isAfterJuly ? now.getFullYear() : now.getFullYear() - 1;
  const seasonStart = new Date(seasonStartYear, 6, 1);
  const seasonEnd = new Date(seasonStartYear + 1, 6, 1);

  const conditions = [
    inArray(pledges.teamId, teamIds),
    inArray(charges.status, ["confirmed", "invoiced"])
  ];
  if (opts.seasonOnly !== false) {
    conditions.push(gte(charges.createdAt, seasonStart));
    conditions.push(lte(charges.createdAt, seasonEnd));
  }

  const rows = await db
    .select({
      sponsorId: sponsors.id,
      displayName: sponsorLabelSql,
      totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .where(and(...conditions))
    .groupBy(sponsors.id, sponsors.displayName, users.name, users.email)
    .orderBy(sql`SUM(${charges.amountCents}) DESC NULLS LAST`)
    .limit(limit);

  return rows.map((r) => ({
    sponsorId: r.sponsorId,
    displayName: r.displayName,
    totalCents: Number(r.totalCents ?? 0)
  }));
}

export type EreignisRow = {
  chargeId: string;
  triggerType: string;
  amountCents: number;
  status: string;
  createdAt: Date;
  matchId: string | null;
  matchDatum: Date | null;
  heimName: string | null;
  gastName: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  teamId: string | null;
  teamName: string | null;
  sponsorDisplayName: string | null;
  /** Spielername bei goal_by_player o.ä. — kommt aus matchEvents.playerName */
  playerName: string | null;
};

export async function listClubEreignisse(clubId: string): Promise<EreignisRow[]> {
  const rows = await db
    .select({
      chargeId: charges.id,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      status: charges.status,
      createdAt: charges.createdAt,
      matchId: charges.matchId,
      matchDatum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      teamId: teams.id,
      teamName: teams.name,
      sponsorDisplayName: sponsorLabelSql,
      playerName: matchEvents.playerName,
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(pledgeRules, eq(charges.pledgeRuleId, pledgeRules.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .leftJoin(matchEvents, eq(charges.matchEventId, matchEvents.id))
    .where(
      and(
        eq(teams.clubId, clubId),
        inArray(charges.status, ["confirmed", "invoiced"])
      )
    )
    .orderBy(desc(charges.createdAt));

  return rows;
}
