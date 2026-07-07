/**
 * Sponsor-Reporting-Queries für die Bilanz-Page (`/sponsor/bilanz`),
 * globale Charge-History (`/sponsor/charges`) und Dashboard-Tiles
 * (Cap-Auslastung + YTD-Total).
 *
 * Convention:
 *  - Active = confirmed | invoiced. pending_approval/cancelled werden
 *    NIE einbezogen (konsistent mit team-finances.ts und sponsor-dashboard.ts).
 *  - `range.from` inklusiv, `range.to` exklusiv.
 *  - Periodisierung (Range-Fenster, Monats-Gruppierung, Cap-Kachel) läuft
 *    durchgängig über `COALESCE(confirmedAt, createdAt)` — identisch zum
 *    Rechnungslauf (`listConfirmedChargesByPeriod`) und Cap-Fenster
 *    (`getMonthlyChargedCents`). So landet ein Spät-Confirm in der Bilanz im
 *    selben Monat wie auf seiner Rechnung, statt im createdAt-Monat.
 *
 * NB: Die Charge-*History* (`listChargesForSponsor`) filtert/sortiert bewusst
 *    weiter über `createdAt` — sie ist ein Ereignis-Log ("wann ist das
 *    passiert"), keine Perioden-Summe, und zeigt confirmedAt als eigene Spalte.
 */
import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  charges,
  pledges,
  pledgeRules,
  matches,
  teams,
  clubs,
  sponsors
} from "@/lib/db/schema";
import type { SponsorBillingCycle } from "@/lib/db/schema/sponsors";
import {
  countStar,
  paginate,
  type PaginatedResult
} from "@/lib/db/queries/_helpers/paginate";
import {
  utcMonthWindow,
  chargeCountsTowardCap
} from "@/lib/db/queries/evaluation";
import type { TriggerType } from "@/lib/triggers/labels";

const ACTIVE_STATUSES = ["confirmed", "invoiced"] as const;

export interface DateRange {
  from: Date;
  to: Date;
}

export interface SponsorBalanceByClub {
  clubId: string;
  clubName: string;
  clubSlug: string;
  totalCents: number;
  eventsCount: number;
}

export interface SponsorBalanceByTeam {
  teamId: string;
  teamName: string;
  clubName: string;
  clubSlug: string;
  totalCents: number;
  eventsCount: number;
}

export interface SponsorBalanceByTrigger {
  triggerType: string;
  totalCents: number;
  eventsCount: number;
}

export interface SponsorBalanceByMonth {
  /** YYYY-MM, UTC. */
  month: string;
  totalCents: number;
  eventsCount: number;
}

export interface SponsorBalance {
  totalCents: number;
  eventsCount: number;
  clubCount: number;
  pledgeCount: number;
  byClub: SponsorBalanceByClub[];
  byTeam: SponsorBalanceByTeam[];
  byTrigger: SponsorBalanceByTrigger[];
  byMonth: SponsorBalanceByMonth[];
}

/**
 * Aggregierte Sponsor-Bilanz über einen Zeitraum.
 *
 * Vier Group-By's in parallel:
 *  - byClub: pro Verein
 *  - byTeam: pro Mannschaft (mit Verein-Kontext)
 *  - byTrigger: pro Trigger-Typ
 *  - byMonth: pro Monat (DATE_TRUNC, UTC)
 *
 * Plus die Top-Level-Zahlen (Σ, Count, distinct-pledges, distinct-clubs).
 */
export async function getSponsorBalance(
  sponsorId: string,
  range: DateRange
): Promise<SponsorBalance> {
  const whereBase = and(
    eq(pledges.sponsorId, sponsorId),
    inArray(charges.status, [...ACTIVE_STATUSES]),
    // Periodisierung über COALESCE(confirmedAt, createdAt) — konsistent mit dem
    // Rechnungslauf (listConfirmedChargesByPeriod) und dem Cap-Fenster
    // (getMonthlyChargedCents). Sonst zeigt die Bilanz einen Spät-Confirm im
    // createdAt-Monat an, obwohl er auf der Rechnung des confirmedAt-Monats
    // landet. COALESCE als rohes SQL-Fragment → Datum als ISO-String binden.
    sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${range.from.toISOString()}`,
    sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) < ${range.to.toISOString()}`
  );

  const [totals, byClub, byTeam, byTrigger, byMonth, pledgeCountRow] =
    await Promise.all([
      // Top-Level
      db
        .select({
          totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
          eventsCount: sql<number>`COUNT(*)::int`,
          clubCount: sql<number>`COUNT(DISTINCT ${teams.clubId})::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .where(whereBase),
      // Per Club
      db
        .select({
          clubId: clubs.id,
          clubName: clubs.name,
          clubSlug: clubs.slug,
          totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
          eventsCount: sql<number>`COUNT(*)::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .innerJoin(clubs, eq(teams.clubId, clubs.id))
        .where(whereBase)
        .groupBy(clubs.id, clubs.name, clubs.slug)
        .orderBy(sql`SUM(${charges.amountCents}) DESC NULLS LAST`),
      // Per Team
      db
        .select({
          teamId: teams.id,
          teamName: teams.name,
          clubName: clubs.name,
          clubSlug: clubs.slug,
          totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
          eventsCount: sql<number>`COUNT(*)::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .innerJoin(clubs, eq(teams.clubId, clubs.id))
        .where(whereBase)
        .groupBy(teams.id, teams.name, clubs.name, clubs.slug)
        .orderBy(sql`SUM(${charges.amountCents}) DESC NULLS LAST`),
      // Per Trigger-Type
      db
        .select({
          triggerType: charges.triggerType,
          totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
          eventsCount: sql<number>`COUNT(*)::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .where(whereBase)
        .groupBy(charges.triggerType)
        .orderBy(sql`SUM(${charges.amountCents}) DESC NULLS LAST`),
      // Per Month (UTC)
      db
        .select({
          month: sql<string>`to_char(date_trunc('month', COALESCE(${charges.confirmedAt}, ${charges.createdAt}) AT TIME ZONE 'UTC'), 'YYYY-MM')`,
          totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
          eventsCount: sql<number>`COUNT(*)::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .where(whereBase)
        .groupBy(
          sql`date_trunc('month', COALESCE(${charges.confirmedAt}, ${charges.createdAt}) AT TIME ZONE 'UTC')`
        )
        .orderBy(
          asc(
            sql`date_trunc('month', COALESCE(${charges.confirmedAt}, ${charges.createdAt}) AT TIME ZONE 'UTC')`
          )
        ),
      // Distinct pledges in range (separate query — pledges existieren auch
      // wenn sie 0 Charges hatten; aber Bilanz zählt nur Pledges die im
      // Zeitraum tatsächlich Geld bewegt haben).
      db
        .select({
          pledgeCount: sql<number>`COUNT(DISTINCT ${pledges.id})::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .where(whereBase)
    ]);

  const t = totals[0];
  return {
    totalCents: Number(t?.totalCents ?? 0),
    eventsCount: Number(t?.eventsCount ?? 0),
    clubCount: Number(t?.clubCount ?? 0),
    pledgeCount: Number(pledgeCountRow[0]?.pledgeCount ?? 0),
    byClub: byClub.map((r) => ({
      clubId: r.clubId,
      clubName: r.clubName,
      clubSlug: r.clubSlug,
      totalCents: Number(r.totalCents),
      eventsCount: Number(r.eventsCount)
    })),
    byTeam: byTeam.map((r) => ({
      teamId: r.teamId,
      teamName: r.teamName,
      clubName: r.clubName,
      clubSlug: r.clubSlug,
      totalCents: Number(r.totalCents),
      eventsCount: Number(r.eventsCount)
    })),
    byTrigger: byTrigger.map((r) => ({
      triggerType: r.triggerType,
      totalCents: Number(r.totalCents),
      eventsCount: Number(r.eventsCount)
    })),
    byMonth: byMonth.map((r) => ({
      month: r.month,
      totalCents: Number(r.totalCents),
      eventsCount: Number(r.eventsCount)
    }))
  };
}

// ----------------------------------------------------------------------------
// listChargesForSponsor — paginated + filter + sort
// ----------------------------------------------------------------------------

export const SPONSOR_CHARGE_SORT_KEYS = [
  "createdAt",
  "amountCents",
  "triggerType",
  "status"
] as const;
export type SponsorChargeSortKey = (typeof SPONSOR_CHARGE_SORT_KEYS)[number];

export type ChargeStatus =
  | "pending_approval"
  | "confirmed"
  | "invoiced"
  | "cancelled";

export interface SponsorChargeFilters {
  clubIds?: string[];
  teamIds?: string[];
  triggerTypes?: TriggerType[];
  statuses?: ChargeStatus[];
  /** Inklusiv. */
  from?: Date;
  /** Exklusiv. */
  to?: Date;
}

export interface SponsorChargeRow {
  id: string;
  createdAt: Date;
  confirmedAt: Date | null;
  amountCents: number;
  triggerType: string;
  status: string;
  matchId: string | null;
  matchDate: Date | null;
  heimName: string | null;
  gastName: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  saison: string | null;
  teamId: string;
  teamName: string;
  clubId: string;
  clubName: string;
  clubSlug: string;
}

interface ListChargesOpts {
  pagination?: { page: number; pageSize: number };
  sort?: SponsorChargeSortKey;
  dir?: "asc" | "desc";
  filters?: SponsorChargeFilters;
}

function buildChargeFilters(
  sponsorId: string,
  filters?: SponsorChargeFilters
): SQL {
  const conds: SQL[] = [eq(pledges.sponsorId, sponsorId)];
  if (filters?.clubIds && filters.clubIds.length > 0) {
    conds.push(inArray(teams.clubId, filters.clubIds));
  }
  if (filters?.teamIds && filters.teamIds.length > 0) {
    conds.push(inArray(pledges.teamId, filters.teamIds));
  }
  if (filters?.triggerTypes && filters.triggerTypes.length > 0) {
    conds.push(inArray(charges.triggerType, filters.triggerTypes));
  }
  if (filters?.statuses && filters.statuses.length > 0) {
    conds.push(inArray(charges.status, filters.statuses));
  }
  if (filters?.from) conds.push(gte(charges.createdAt, filters.from));
  if (filters?.to) conds.push(lt(charges.createdAt, filters.to));
  return and(...conds) as SQL;
}

function chargeOrder(sort?: SponsorChargeSortKey, dir?: "asc" | "desc"): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "amountCents":
      return [d(charges.amountCents), desc(charges.createdAt)];
    case "triggerType":
      return [d(charges.triggerType), desc(charges.createdAt)];
    case "status":
      return [d(charges.status), desc(charges.createdAt)];
    case "createdAt":
    default:
      return [d(charges.createdAt)];
  }
}

const CHARGE_SELECT = {
  id: charges.id,
  createdAt: charges.createdAt,
  confirmedAt: charges.confirmedAt,
  amountCents: charges.amountCents,
  triggerType: charges.triggerType,
  status: charges.status,
  matchId: charges.matchId,
  matchDate: matches.datum,
  heimName: matches.heimName,
  gastName: matches.gastName,
  ergebnisHeim: matches.ergebnisHeim,
  ergebnisGast: matches.ergebnisGast,
  saison: charges.saison,
  teamId: teams.id,
  teamName: teams.name,
  clubId: clubs.id,
  clubName: clubs.name,
  clubSlug: clubs.slug
};

/**
 * Liefert paginierte + gefilterte Charge-History für einen Sponsor.
 *
 * Mit `pagination`: `PaginatedResult<SponsorChargeRow>`.
 * Ohne `pagination` (nur `filters` + ggf. `sort`): liefert ALLE matching rows
 * als Array — wird vom CSV-Export verwendet.
 */
export function listChargesForSponsor(
  sponsorId: string,
  opts: ListChargesOpts & { pagination: { page: number; pageSize: number } }
): Promise<PaginatedResult<SponsorChargeRow>>;
export function listChargesForSponsor(
  sponsorId: string,
  opts?: Omit<ListChargesOpts, "pagination">
): Promise<SponsorChargeRow[]>;
export async function listChargesForSponsor(
  sponsorId: string,
  opts: ListChargesOpts = {}
): Promise<SponsorChargeRow[] | PaginatedResult<SponsorChargeRow>> {
  const where = buildChargeFilters(sponsorId, opts.filters);
  const order = chargeOrder(opts.sort, opts.dir);

  if (!opts.pagination) {
    const rows = await db
      .select(CHARGE_SELECT)
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .leftJoin(matches, eq(charges.matchId, matches.id))
      .where(where)
      .orderBy(...order);
    return rows as SponsorChargeRow[];
  }

  const dataQuery = db
    .select(CHARGE_SELECT)
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(where)
    .orderBy(...order)
    .$dynamic();

  const countQuery = db
    .select({ count: countStar() })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(where)
    .$dynamic();

  return paginate<SponsorChargeRow>(dataQuery, countQuery, opts.pagination);
}

export interface SponsorChargeFilterOptions {
  clubOpts: Array<{ id: string; name: string }>;
  teamOpts: Array<{ id: string; name: string; clubName: string }>;
  triggerOpts: Array<{ triggerType: string }>;
}

/**
 * Distinkte Filter-Optionen (Vereine/Mannschaften/Trigger) für die Charge-
 * History eines Sponsors — nur Werte, in denen er bereits Charges hatte
 * (sonst leere Dropdowns).
 */
export async function getSponsorChargeFilterOptions(
  sponsorId: string
): Promise<SponsorChargeFilterOptions> {
  const [clubOpts, teamOpts, triggerOpts] = await Promise.all([
    db
      .selectDistinct({ id: clubs.id, name: clubs.name })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(pledges.sponsorId, sponsorId))
      .orderBy(clubs.name),
    db
      .selectDistinct({ id: teams.id, name: teams.name, clubName: clubs.name })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(pledges.sponsorId, sponsorId))
      .orderBy(teams.name),
    db
      .select({ triggerType: charges.triggerType })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(eq(pledges.sponsorId, sponsorId))
      .groupBy(charges.triggerType)
      .orderBy(sql`MIN(${charges.triggerType})`)
  ]);
  return { clubOpts, teamOpts, triggerOpts };
}

// ----------------------------------------------------------------------------
// getCapUsageForActivePledges — pro aktivem Pledge: monthly cap + already
// charged this month + percentage. Quelle für Dashboard-Tile + Pledge-Liste.
// ----------------------------------------------------------------------------

export interface PledgeCapUsage {
  pledgeId: string;
  teamId: string;
  teamName: string;
  clubName: string;
  clubSlug: string;
  monthlyCapCents: number | null;
  chargedThisMonthCents: number;
  /** 0..1, oder null wenn kein Cap gesetzt ist. */
  percentage: number | null;
  /** Abrechnungs-Rhythmus des Sponsors (steuert das Tile-Framing). */
  billingCycle: SponsorBillingCycle;
  /**
   * Summe der bisher in der LAUFENDEN Saison bestätigten Beiträge dieses
   * Pledges. Bei `billingCycle='season_end'` ist das der Betrag, der sich auf
   * die EINE Saison-Rechnung sammelt — der Monats-Cap deckelt nur pro Monat,
   * nicht die Rechnungssumme. Für monthly-Sponsoren informativ (= YTD-Saison).
   */
  seasonToDateCents: number;
}

/**
 * Cap-Auslastung pro AKTIVEM Pledge im aktuellen Kalendermonat.
 * Pledges ohne `monthlyCapCents` werden zwar zurückgegeben (percentage = null),
 * damit Caller sie z.B. als "kein Cap" rendern können.
 *
 * Sortiert nach Auslastung absteigend; Pledges ohne Cap landen ans Ende.
 */
export async function getCapUsageForActivePledges(
  sponsorId: string,
  now: Date = new Date()
): Promise<PledgeCapUsage[]> {
  // Gemeinsame Cap-Fenster-/Status-Definition — deckungsgleich mit dem
  // Enforcement (evaluate-match / getMonthlyChargedCents): UTC-Monat, Anker
  // COALESCE(confirmedAt, createdAt), Status ∈ CAP_COUNTED_STATUSES (inkl.
  // pending_approval). Vorher zeigte die Anzeige systematisch weniger
  // Auslastung als durchgesetzt wurde.
  const { start: monthStart, end: monthEnd } = utcMonthWindow(now);

  // Laufendes Saison-Fenster [1.7., 1.7. Folgejahr) — dieselbe Juli–Juni-Logik
  // wie seasonWindowFor (generate-season-end-invoices), aber für die AKTUELL
  // laufende, noch nicht fakturierte Saison. Bestimmt, was sich bei season_end
  // auf die eine Saison-Rechnung sammelt (Insert-/Confirm-Zeitpunkt =
  // COALESCE(confirmedAt, createdAt), konsistent mit dem Rechnungslauf).
  const seasonStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const seasonStart = new Date(Date.UTC(seasonStartYear, 6, 1));
  const seasonEnd = new Date(Date.UTC(seasonStartYear + 1, 6, 1));

  const rows = await db
    .select({
      pledgeId: pledges.id,
      teamId: teams.id,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      monthlyCapCents: pledges.monthlyCapCents,
      billingCycle: sponsors.billingCycle,
      // chargeCountsTowardCap = EINE gemeinsame Definition mit dem Enforcement
      // (getMonthlyChargedCents): COALESCE(confirmedAt, createdAt) im UTC-Monat
      // UND Status ∈ CAP_COUNTED_STATUSES (inkl. pending_approval). Sonst zeigt
      // die Kachel eine andere Auslastung, als der Cap-Check durchsetzt.
      chargedThisMonthCents: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
        WHERE ${chargeCountsTowardCap(monthStart, monthEnd)}
      ), 0)::int`,
      // Saison-Kumuliert (season_end): was sich auf die EINE Saison-Rechnung
      // sammelt — nur fakturierbare Beiträge (confirmed/invoiced), Anker
      // COALESCE(confirmedAt, createdAt) wie der Rechnungslauf.
      seasonToDateCents: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (
        WHERE ${charges.status} IN ('confirmed','invoiced')
          AND COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${seasonStart.toISOString()}
          AND COALESCE(${charges.confirmedAt}, ${charges.createdAt}) <  ${seasonEnd.toISOString()}
      ), 0)::int`
    })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(charges, eq(charges.pledgeId, pledges.id))
    .where(and(eq(pledges.sponsorId, sponsorId), eq(pledges.status, "active")))
    .groupBy(
      pledges.id,
      teams.id,
      teams.name,
      clubs.name,
      clubs.slug,
      pledges.monthlyCapCents,
      sponsors.billingCycle
    );

  return rows
    .map((r) => {
      const charged = Number(r.chargedThisMonthCents ?? 0);
      const cap = r.monthlyCapCents;
      return {
        pledgeId: r.pledgeId,
        teamId: r.teamId,
        teamName: r.teamName,
        clubName: r.clubName,
        clubSlug: r.clubSlug,
        monthlyCapCents: cap,
        chargedThisMonthCents: charged,
        percentage: cap ? Math.min(1, charged / cap) : null,
        billingCycle: r.billingCycle,
        seasonToDateCents: Number(r.seasonToDateCents ?? 0)
      } satisfies PledgeCapUsage;
    })
    .sort((a, b) => {
      // capped + most-utilised first
      if (a.percentage === null && b.percentage === null) return 0;
      if (a.percentage === null) return 1;
      if (b.percentage === null) return -1;
      return b.percentage - a.percentage;
    });
}

// ----------------------------------------------------------------------------
// Helpers für Range-Selector (this-month / this-year / this-season / all-time)
// ----------------------------------------------------------------------------

export type SponsorRangeOption =
  | "this-month"
  | "this-year"
  | "this-season"
  | "all-time";

/**
 * Liefert `{from, to}` (UTC) für die vordefinierten Range-Optionen. Saison
 * geht August → Juli (deutsche Amateur-Saison, konsistent mit der DFB-Logik).
 *
 * `to` ist immer EXKLUSIV (= 1 ms nach Periode-Ende reicht; wir geben den
 * ersten Tag der Folgeperiode).
 */
export function getRangeForOption(
  option: SponsorRangeOption,
  now: Date = new Date()
): DateRange {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  switch (option) {
    case "this-month":
      return {
        from: new Date(Date.UTC(year, month, 1)),
        to: new Date(Date.UTC(year, month + 1, 1))
      };
    case "this-year":
      return {
        from: new Date(Date.UTC(year, 0, 1)),
        to: new Date(Date.UTC(year + 1, 0, 1))
      };
    case "this-season": {
      // Saison startet 1. August. Wenn wir vor August sind, hat die Saison
      // im letzten Jahr begonnen.
      const seasonStartYear = month >= 7 ? year : year - 1;
      return {
        from: new Date(Date.UTC(seasonStartYear, 7, 1)),
        to: new Date(Date.UTC(seasonStartYear + 1, 7, 1))
      };
    }
    case "all-time":
      return {
        from: new Date(Date.UTC(2000, 0, 1)),
        to: new Date(Date.UTC(year + 1, 0, 1))
      };
  }
}

/**
 * Parses `?from=YYYY-MM-DD&to=YYYY-MM-DD` from a URLSearchParams-like object.
 * Returns `null` if either is missing or unparseable — caller falls back to a
 * preset range.
 */
export function parseCustomRange(sp: {
  get: (key: string) => string | null;
}): DateRange | null {
  const f = sp.get("from");
  const t = sp.get("to");
  if (!f || !t) return null;
  const from = new Date(f + "T00:00:00.000Z");
  const to = new Date(t + "T00:00:00.000Z");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from >= to) return null;
  return { from, to };
}

/**
 * Marker: silence unused-import in dev — `pledgeRules` is intentionally imported
 * so future cap-by-rule analytics can plug in without re-wiring.
 */
void pledgeRules;
