/**
 * Verein-weite Reporting-Queries für die Filter-/Export-Tabellen unter
 * `/verein/[slug]/{charges,pledges,sponsor/[id]}`.
 *
 * Pattern wie `lib/db/queries/invoices.ts`: jede List-Query ist als Overload
 * verfügbar — ohne `opts` liefert sie ALLE Rows (für CSV-Export ohne
 * Pagination), mit `opts.pagination` ein `PaginatedResult<…>` für die
 * DataTable-Page.
 *
 * Filter werden defensiv per `eq()` / `gte()` / `lte()` appliziert. Unbekannte
 * Filter-Werte werden ignoriert (kein 400, kein Throw — UI darf rohe URL-
 * Strings reichen).
 */
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  sql,
  type SQL
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  charges,
  pledges,
  pledgeRules,
  matches,
  teams,
  sponsors,
  users
} from "@/lib/db/schema";
import {
  countStar,
  paginate,
  type PaginatedResult
} from "@/lib/db/queries/_helpers/paginate";
import { sponsorLabelSql } from "./sponsor-label";

type SortDir = "asc" | "desc";

// ─────────────────────────────────────────────────────────────────────────────
// listChargesForClub
// ─────────────────────────────────────────────────────────────────────────────

export const CLUB_CHARGE_SORT_KEYS = [
  "matchDate",
  "amountCents",
  "status",
  "triggerType",
  "sponsorDisplayName",
  "teamName"
] as const;
export type ClubChargeSortKey = (typeof CLUB_CHARGE_SORT_KEYS)[number];

export interface ClubChargeFilter {
  teamId?: string;
  sponsorId?: string;
  triggerType?: string;
  status?: string;
  /** Inklusiv, ISO-Date (`YYYY-MM-DD` oder voller ISO-String). */
  dateFrom?: string;
  /** Inklusiv, ISO-Date. */
  dateTo?: string;
}

export interface ClubChargeRow {
  id: string;
  matchId: string | null;
  matchDate: Date | null;
  teamId: string;
  teamName: string;
  heimName: string | null;
  gastName: string | null;
  sponsorId: string;
  sponsorDisplayName: string;
  sponsorEmail: string;
  triggerType: string;
  amountCents: number;
  status: string;
  createdAt: Date;
  confirmedAt: Date | null;
}

function chargeWhere(clubId: string, f: ClubChargeFilter | undefined): SQL {
  const parts: SQL[] = [eq(teams.clubId, clubId)];
  if (f?.teamId) parts.push(eq(teams.id, f.teamId));
  if (f?.sponsorId) parts.push(eq(pledges.sponsorId, f.sponsorId));
  if (f?.triggerType) parts.push(eq(charges.triggerType, f.triggerType as never));
  if (f?.status) parts.push(eq(charges.status, f.status as never));
  if (f?.dateFrom) {
    const from = new Date(f.dateFrom);
    if (!Number.isNaN(from.getTime())) parts.push(gte(matches.datum, from));
  }
  if (f?.dateTo) {
    const to = new Date(f.dateTo);
    if (!Number.isNaN(to.getTime())) {
      // Wenn nur Datum (kein Time) → bis Tagesende.
      if (/^\d{4}-\d{2}-\d{2}$/.test(f.dateTo)) {
        to.setUTCHours(23, 59, 59, 999);
      }
      parts.push(lte(matches.datum, to));
    }
  }
  return and(...parts)!;
}

function chargeOrder(sort?: ClubChargeSortKey, dir?: SortDir): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "amountCents":
      return [d(charges.amountCents), desc(charges.createdAt)];
    case "status":
      return [d(charges.status), desc(charges.createdAt)];
    case "triggerType":
      return [d(charges.triggerType), desc(charges.createdAt)];
    case "sponsorDisplayName":
      return [d(sponsors.displayName), desc(charges.createdAt)];
    case "teamName":
      return [d(teams.name), desc(charges.createdAt)];
    case "matchDate":
      return [d(matches.datum), desc(charges.createdAt)];
    default:
      return [desc(matches.datum), desc(charges.createdAt)];
  }
}

const chargeSelect = {
  id: charges.id,
  matchId: charges.matchId,
  matchDate: matches.datum,
  teamId: teams.id,
  teamName: teams.name,
  heimName: matches.heimName,
  gastName: matches.gastName,
  sponsorId: sponsors.id,
  sponsorDisplayName: sponsorLabelSql,
  sponsorEmail: users.email,
  triggerType: charges.triggerType,
  amountCents: charges.amountCents,
  status: charges.status,
  createdAt: charges.createdAt,
  confirmedAt: charges.confirmedAt
};

/**
 * Listet Charges für einen Verein quer durch alle Teams/Sponsoren.
 *
 * Overload:
 *   - Ohne `opts`: ALLE Rows als Array (CSV-Export).
 *   - Mit `opts.pagination`: `PaginatedResult`.
 */
export function listChargesForClub(
  clubId: string,
  opts?: { filter?: ClubChargeFilter }
): Promise<ClubChargeRow[]>;
export function listChargesForClub(
  clubId: string,
  opts: {
    pagination: { page: number; pageSize: number };
    filter?: ClubChargeFilter;
    sort?: ClubChargeSortKey;
    dir?: SortDir;
  }
): Promise<PaginatedResult<ClubChargeRow>>;
export async function listChargesForClub(
  clubId: string,
  opts?: {
    pagination?: { page: number; pageSize: number };
    filter?: ClubChargeFilter;
    sort?: ClubChargeSortKey;
    dir?: SortDir;
  }
): Promise<ClubChargeRow[] | PaginatedResult<ClubChargeRow>> {
  const where = chargeWhere(clubId, opts?.filter);

  if (!opts?.pagination) {
    return db
      .select(chargeSelect)
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
      .innerJoin(users, eq(sponsors.userId, users.id))
      .leftJoin(matches, eq(charges.matchId, matches.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(where)
      .orderBy(...chargeOrder(opts?.sort, opts?.dir));
  }

  const dataQuery = db
    .select(chargeSelect)
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(where)
    .orderBy(...chargeOrder(opts.sort, opts.dir))
    .$dynamic();

  const countQuery = db
    .select({ count: countStar() })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(where)
    .$dynamic();

  return paginate<ClubChargeRow>(dataQuery, countQuery, opts.pagination);
}

// ─────────────────────────────────────────────────────────────────────────────
// listPledgesForClub
// ─────────────────────────────────────────────────────────────────────────────

export const CLUB_PLEDGE_SORT_KEYS = [
  "createdAt",
  "amountCents",
  "status",
  "triggerType",
  "sponsorDisplayName",
  "teamName",
  "capUsage"
] as const;
export type ClubPledgeSortKey = (typeof CLUB_PLEDGE_SORT_KEYS)[number];

export interface ClubPledgeFilter {
  teamId?: string;
  sponsorId?: string;
  triggerType?: string;
  /** "active" | "paused" | "ended" */
  status?: string;
}

export interface ClubPledgeReportRow {
  pledgeId: string;
  ruleId: string;
  sponsorId: string;
  sponsorDisplayName: string;
  sponsorEmail: string;
  teamId: string;
  teamName: string;
  triggerType: string;
  amountCents: number;
  perMatchCapCents: number | null;
  monthlyCapCents: number | null;
  status: string;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
  /** SUM amount_cents confirmed+invoiced charges für die laufende Monatsperiode. */
  monthChargedCents: number;
  /** Lifetime SUM amount_cents confirmed+invoiced. */
  lifetimeChargedCents: number;
}

function pledgeWhere(clubId: string, f: ClubPledgeFilter | undefined): SQL {
  const parts: SQL[] = [eq(teams.clubId, clubId)];
  if (f?.teamId) parts.push(eq(teams.id, f.teamId));
  if (f?.sponsorId) parts.push(eq(pledges.sponsorId, f.sponsorId));
  if (f?.status) parts.push(eq(pledges.status, f.status as never));
  if (f?.triggerType)
    parts.push(eq(pledgeRules.triggerType, f.triggerType as never));
  return and(...parts)!;
}

function pledgeOrder(sort?: ClubPledgeSortKey, dir?: SortDir): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "amountCents":
      return [d(pledgeRules.amountCents), desc(pledges.createdAt)];
    case "status":
      return [d(pledges.status), desc(pledges.createdAt)];
    case "triggerType":
      return [d(pledgeRules.triggerType), desc(pledges.createdAt)];
    case "sponsorDisplayName":
      return [d(sponsors.displayName), desc(pledges.createdAt)];
    case "teamName":
      return [d(teams.name), desc(pledges.createdAt)];
    case "capUsage":
      // capUsage wird auf JS-Seite berechnet, daher hier nur stabile DB-Order.
      // Die Page sortiert ggf. clientseitig nach `capUsagePct`.
      return [desc(pledges.createdAt)];
    case "createdAt":
    default:
      return [desc(pledges.createdAt), desc(pledgeRules.createdAt)];
  }
}

const pledgeSelect = {
  pledgeId: pledges.id,
  ruleId: pledgeRules.id,
  sponsorId: sponsors.id,
  sponsorDisplayName: sponsorLabelSql,
  sponsorEmail: users.email,
  teamId: teams.id,
  teamName: teams.name,
  triggerType: pledgeRules.triggerType,
  amountCents: pledgeRules.amountCents,
  perMatchCapCents: pledgeRules.perMatchCapCents,
  monthlyCapCents: pledges.monthlyCapCents,
  status: pledges.status,
  startsAt: pledges.startsAt,
  endsAt: pledges.endsAt,
  createdAt: pledges.createdAt,
  monthChargedCents: sql<number>`COALESCE((
    SELECT SUM(c.amount_cents)
    FROM ${charges} c
    WHERE c.pledge_id = ${pledges.id}
      AND c.pledge_rule_id = ${pledgeRules.id}
      AND c.status IN ('confirmed','invoiced')
      AND c.confirmed_at >= date_trunc('month', NOW())
      AND c.confirmed_at < date_trunc('month', NOW()) + interval '1 month'
  ), 0)::int`,
  lifetimeChargedCents: sql<number>`COALESCE((
    SELECT SUM(c.amount_cents)
    FROM ${charges} c
    WHERE c.pledge_id = ${pledges.id}
      AND c.pledge_rule_id = ${pledgeRules.id}
      AND c.status IN ('confirmed','invoiced')
  ), 0)::int`
};

export function listPledgesForClub(
  clubId: string,
  opts?: { filter?: ClubPledgeFilter }
): Promise<ClubPledgeReportRow[]>;
export function listPledgesForClub(
  clubId: string,
  opts: {
    pagination: { page: number; pageSize: number };
    filter?: ClubPledgeFilter;
    sort?: ClubPledgeSortKey;
    dir?: SortDir;
  }
): Promise<PaginatedResult<ClubPledgeReportRow>>;
export async function listPledgesForClub(
  clubId: string,
  opts?: {
    pagination?: { page: number; pageSize: number };
    filter?: ClubPledgeFilter;
    sort?: ClubPledgeSortKey;
    dir?: SortDir;
  }
): Promise<ClubPledgeReportRow[] | PaginatedResult<ClubPledgeReportRow>> {
  const where = pledgeWhere(clubId, opts?.filter);

  if (!opts?.pagination) {
    return db
      .select(pledgeSelect)
      .from(pledgeRules)
      .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
      .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
      .innerJoin(users, eq(sponsors.userId, users.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(where)
      .orderBy(...pledgeOrder(opts?.sort, opts?.dir));
  }

  const dataQuery = db
    .select(pledgeSelect)
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(where)
    .orderBy(...pledgeOrder(opts.sort, opts.dir))
    .$dynamic();

  const countQuery = db
    .select({ count: countStar() })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(where)
    .$dynamic();

  return paginate<ClubPledgeReportRow>(dataQuery, countQuery, opts.pagination);
}

// ─────────────────────────────────────────────────────────────────────────────
// getSponsorOverviewForClub
// ─────────────────────────────────────────────────────────────────────────────

export interface SponsorOverviewTeam {
  teamId: string;
  teamName: string;
  saison: string;
  pledgeCount: number;
}

export interface SponsorOverviewTriggerBreakdown {
  triggerType: string;
  countCharges: number;
  sumCents: number;
}

export interface SponsorOverview {
  sponsor: {
    id: string;
    displayName: string;
    type: string;
    email: string;
    businessName: string | null;
  };
  teams: SponsorOverviewTeam[];
  triggerBreakdown: SponsorOverviewTriggerBreakdown[];
  totals: {
    activePledges: number;
    totalChargesLifetimeCents: number;
    totalChargesYtdCents: number;
  };
}

/**
 * Vollständiges Bild eines Sponsors gegenüber einem Verein:
 *  - Stammdaten
 *  - alle Teams mit Pledge-Count
 *  - Aggregat pro Trigger-Typ (count + Summe der confirmed+invoiced Charges)
 *  - KPI-Tiles: Anzahl aktive Pledges, Lifetime-Total, YTD-Total
 *
 * Charges-Detail-Liste fetcht die Page separat via `listChargesForClub` mit
 * `filter.sponsorId` (paginiert).
 */
export async function getSponsorOverviewForClub(
  clubId: string,
  sponsorId: string
): Promise<SponsorOverview | null> {
  const [sp] = await db
    .select({
      id: sponsors.id,
      displayName: sponsorLabelSql,
      type: sponsors.type,
      email: users.email,
      businessName: sponsors.businessName
    })
    .from(sponsors)
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(eq(sponsors.id, sponsorId))
    .limit(1);
  if (!sp) return null;

  // Alle Teams dieses Clubs, an die der Sponsor pledged hat.
  const teamRows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      saison: teams.saison,
      pledgeCount: sql<number>`COUNT(${pledges.id})::int`
    })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(and(eq(pledges.sponsorId, sponsorId), eq(teams.clubId, clubId)))
    .groupBy(teams.id, teams.name, teams.saison)
    .orderBy(asc(teams.name));

  // Aggregat pro Trigger-Typ über ALLE Charges des Sponsors gegen Teams dieses Clubs.
  const triggerRows = await db
    .select({
      triggerType: charges.triggerType,
      countCharges: sql<number>`COUNT(*)::int`,
      sumCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(
      and(
        eq(pledges.sponsorId, sponsorId),
        eq(teams.clubId, clubId),
        inArray(charges.status, ["confirmed", "invoiced"])
      )
    )
    .groupBy(charges.triggerType)
    .orderBy(desc(sql`SUM(${charges.amountCents})`));

  const [active] = await db
    .select({ c: sql<number>`COUNT(*)::int` })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(
      and(
        eq(pledges.sponsorId, sponsorId),
        eq(teams.clubId, clubId),
        eq(pledges.status, "active")
      )
    );

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const [totals] = await db
    .select({
      lifetime: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
        WHERE ${charges.status} IN ('confirmed','invoiced')
      ), 0)::int`,
      ytd: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
        WHERE ${charges.status} IN ('confirmed','invoiced')
          AND ${charges.confirmedAt} >= ${yearStart.toISOString()}
      ), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(and(eq(pledges.sponsorId, sponsorId), eq(teams.clubId, clubId)));

  return {
    sponsor: {
      id: sp.id,
      displayName: sp.displayName,
      type: sp.type,
      email: sp.email,
      businessName: sp.businessName
    },
    teams: teamRows.map((t) => ({
      teamId: t.teamId,
      teamName: t.teamName,
      saison: t.saison,
      pledgeCount: Number(t.pledgeCount)
    })),
    triggerBreakdown: triggerRows.map((r) => ({
      triggerType: r.triggerType,
      countCharges: Number(r.countCharges),
      sumCents: Number(r.sumCents)
    })),
    totals: {
      activePledges: Number(active?.c ?? 0),
      totalChargesLifetimeCents: Number(totals?.lifetime ?? 0),
      totalChargesYtdCents: Number(totals?.ytd ?? 0)
    }
  };
}

export interface ClubFilterOptions {
  teamRows: Array<{ id: string; name: string }>;
  sponsorRows: Array<{ id: string; displayName: string }>;
}

/**
 * Filter-Dropdown-Optionen für die Verein-Charges-/Pacts-Tabellen: alle
 * Mannschaften des Vereins + die Sponsoren, die hier schon Pledges haben.
 */
export async function getClubFilterOptions(
  clubId: string
): Promise<ClubFilterOptions> {
  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.clubId, clubId))
    .orderBy(asc(teams.name));
  const sponsorRows = await db
    .selectDistinct({ id: sponsors.id, displayName: sponsors.displayName })
    .from(sponsors)
    .innerJoin(pledges, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(eq(teams.clubId, clubId))
    .orderBy(asc(sponsors.displayName));
  return { teamRows, sponsorRows };
}

export interface ClubTeamStats {
  activePledgeCounts: Map<string, number>;
  recentChargeCents: Map<string, number>;
  recentMatchCounts: Map<string, number>;
}

/**
 * Per-Team-Aggregate für die Mannschaften-Übersicht: aktive Pledges,
 * Charge-Summe + Spiel-Anzahl seit `since`. Als Maps (teamId → Zahl).
 */
export async function getClubTeamStats(
  teamIds: string[],
  since: Date
): Promise<ClubTeamStats> {
  if (teamIds.length === 0) {
    return {
      activePledgeCounts: new Map(),
      recentChargeCents: new Map(),
      recentMatchCounts: new Map()
    };
  }
  const [activePledgeCounts, recentChargeCents, recentMatchCounts] = await Promise.all([
    db
      .select({ teamId: pledges.teamId, n: sql<number>`count(*)::int` })
      .from(pledges)
      .where(and(inArray(pledges.teamId, teamIds), eq(pledges.status, "active")))
      .groupBy(pledges.teamId)
      .then((rows) => new Map(rows.map((r) => [r.teamId, Number(r.n)]))),
    db
      .select({
        teamId: pledges.teamId,
        s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int`
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(and(inArray(pledges.teamId, teamIds), gte(charges.createdAt, since)))
      .groupBy(pledges.teamId)
      .then((rows) => new Map(rows.map((r) => [r.teamId, Number(r.s)]))),
    db
      .select({ teamId: matches.teamId, n: sql<number>`count(*)::int` })
      .from(matches)
      .where(and(inArray(matches.teamId, teamIds), gte(matches.datum, since)))
      .groupBy(matches.teamId)
      .then((rows) => new Map(rows.map((r) => [r.teamId, Number(r.n)])))
  ]);
  return { activePledgeCounts, recentChargeCents, recentMatchCounts };
}

/** Anzahl aktiver Pledges über alle Mannschaften eines Clubs (Trial-Banner). */
export async function countActivePledgesForClub(clubId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(and(eq(teams.clubId, clubId), eq(pledges.status, "active")));
  return Number(row?.n ?? 0);
}

export interface VereinDashboardKpis {
  teamRows: Array<{ id: string; name: string }>;
  activePledgeCount: number;
  weeklyChargeCents: number;
  monthlyChargeCents: number;
  recentMatchCount: number;
}

/**
 * KPI-Kacheln des Vereins-Dashboards (/verein/[slug]): aktive Mannschaften,
 * aktive Pledges, Charge-Summen (Woche/Monat), Spiele der letzten 7 Tage.
 */
export async function getVereinDashboardKpis(
  clubId: string,
  now: Date
): Promise<VereinDashboardKpis> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [teamRows, activePledgeCount, weeklyChargeCents, monthlyChargeCents, recentMatchCount] =
    await Promise.all([
      db
        .select({ id: teams.id, name: teams.name })
        .from(teams)
        .where(and(eq(teams.clubId, clubId), eq(teams.isActive, true))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(pledges)
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .where(and(eq(teams.clubId, clubId), eq(pledges.status, "active")))
        .then((r) => Number(r[0]?.n ?? 0)),
      db
        .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .where(and(eq(teams.clubId, clubId), gte(charges.createdAt, weekStart)))
        .then((r) => Number(r[0]?.s ?? 0)),
      db
        .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .where(and(eq(teams.clubId, clubId), gte(charges.createdAt, monthStart)))
        .then((r) => Number(r[0]?.s ?? 0)),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(matches)
        .innerJoin(teams, eq(matches.teamId, teams.id))
        .where(and(eq(teams.clubId, clubId), gte(matches.datum, weekStart)))
        .then((r) => Number(r[0]?.n ?? 0))
    ]);

  return { teamRows, activePledgeCount, weeklyChargeCents, monthlyChargeCents, recentMatchCount };
}
