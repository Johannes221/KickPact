import { and, eq, desc, gt, sql, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  matches,
  teams,
  clubs,
  pledges,
  pledgeRules,
  charges,
  sponsors,
  users,
  eventApprovals
} from "@/lib/db/schema";
import { sponsorLabelSql } from "./sponsor-label";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { categorize, type TriggerCategory } from "@/lib/billing/trigger-categories";

/**
 * Live-Statistik für die Team-Übersicht (Hero-KPI-Cards).
 */
export interface TeamHeroKpis {
  activePledges: number;
  thisMonthChargesCents: number;
  pendingApprovals: number;
  nextMatchDatum: Date | null;
  nextMatchOpponent: string | null;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export async function getTeamHeroKpis(teamId: string): Promise<TeamHeroKpis> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = startOfNextMonth(now);

  const [activePledgesRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(pledges)
    .where(and(eq(pledges.teamId, teamId), eq(pledges.status, "active")));

  const [thisMonthRow] = await db
    .select({
      cents: sql<number>`COALESCE(SUM(${charges.amountCents}) FILTER (WHERE ${charges.status} IN ('confirmed','invoiced') AND ${charges.createdAt} >= ${monthStart} AND ${charges.createdAt} < ${monthEnd}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(eq(pledges.teamId, teamId));

  const [pendingRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(eventApprovals)
    .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(and(eq(pledges.teamId, teamId), eq(eventApprovals.status, "pending")));

  const [nextMatch] = await db
    .select({
      datum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName
    })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), gt(matches.datum, now)))
    .orderBy(matches.datum)
    .limit(1);

  // Gegner bestimmen — Heim/Auswärts robust via detectTeamSide (Vereinsname
  // als Token-Quelle, weil der Mannschafts-Name oft keinen Vereins-Token hat).
  let opponent: string | null = null;
  if (nextMatch) {
    const [team] = await db
      .select({ name: teams.name, clubName: clubs.name })
      .from(teams)
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(teams.id, teamId))
      .limit(1);
    if (team) {
      const isHeim =
        detectTeamSide([team.name, team.clubName], nextMatch.heimName) === "heim";
      opponent = isHeim ? nextMatch.gastName : nextMatch.heimName;
    }
  }

  return {
    activePledges: Number(activePledgesRow?.n ?? 0),
    thisMonthChargesCents: Number(thisMonthRow?.cents ?? 0),
    pendingApprovals: Number(pendingRow?.n ?? 0),
    nextMatchDatum: nextMatch?.datum ?? null,
    nextMatchOpponent: opponent
  };
}

export interface RecentTeamMatch {
  matchId: string;
  datum: Date;
  heimName: string;
  gastName: string;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  status: "scheduled" | "live" | "finished" | "cancelled" | "postponed";
  chargesSumCents: number;
}

/** Letzte N Spiele (alle Status) mit Charges-Summe. */
export async function listRecentTeamMatches(
  teamId: string,
  limit = 5
): Promise<RecentTeamMatch[]> {
  const rows = await db
    .select({
      matchId: matches.id,
      datum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      status: matches.status,
      chargesSumCents: sql<number>`COALESCE((
        SELECT SUM(c.amount_cents) FROM ${charges} c
        WHERE c.match_id = ${matches.id}
          AND c.status IN ('confirmed','invoiced')
      ), 0)::int`
    })
    .from(matches)
    .where(eq(matches.teamId, teamId))
    .orderBy(desc(matches.datum))
    .limit(limit);

  return rows.map((r) => ({
    matchId: r.matchId,
    datum: r.datum,
    heimName: r.heimName,
    gastName: r.gastName,
    ergebnisHeim: r.ergebnisHeim,
    ergebnisGast: r.ergebnisGast,
    status: r.status,
    chargesSumCents: Number(r.chargesSumCents ?? 0)
  }));
}

export interface TeamTopSponsor {
  sponsorId: string;
  displayName: string;
  totalCents: number;
}

export async function getTopSponsorsForTeam(
  teamId: string,
  limit = 3
): Promise<TeamTopSponsor[]> {
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
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, ["confirmed", "invoiced"])
      )
    )
    .groupBy(sponsors.id, sponsors.displayName, users.name, users.email)
    .orderBy(sql`SUM(${charges.amountCents}) DESC NULLS LAST`)
    .limit(limit);

  return rows.map((r) => ({
    sponsorId: r.sponsorId,
    displayName: r.displayName,
    totalCents: Number(r.totalCents ?? 0)
  }));
}

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
 *  Team- + Vereinsname (vgl. ursprüngliche Inline-Logik der Dashboard-Seite). */
export async function computeTeamSeasonStats(
  teamId: string, teamName: string, clubName: string
): Promise<TeamSeasonStats> {
  const rows = await db.select().from(matches).where(eq(matches.teamId, teamId));
  const finished = rows.filter((m) => m.status === "finished" && m.ergebnisHeim !== null);
  const names = [teamName, clubName];
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  for (const m of finished) {
    const isHeim = detectTeamSide(names, m.heimName) === "heim";
    const gF = isHeim ? (m.ergebnisHeim ?? 0) : (m.ergebnisGast ?? 0);
    const gA = isHeim ? (m.ergebnisGast ?? 0) : (m.ergebnisHeim ?? 0);
    goalsFor += gF; goalsAgainst += gA;
    if (gF > gA) wins++; else if (gF < gA) losses++; else draws++;
  }
  return { games: finished.length, wins, draws, losses, goalsFor, goalsAgainst };
}

// ---------------- Pacts (Tab 2) ----------------

export interface TeamPactRow {
  pledgeId: string;
  ruleId: string;
  sponsorId: string;
  sponsorDisplayName: string;
  triggerType: string;
  triggerLabel: string;
  triggerEmoji: string;
  triggerScope: "match" | "season";
  /** Auto = vom Crawler erkannt, manual = manuell zu melden. Season = season-scoped. */
  triggerKind: TriggerCategory;
  amountCents: number;
  perMatchCapCents: number | null;
  monthlyCapCents: number | null;
  chargedCents: number;
  status: "active" | "paused" | "ended";
}

export interface ListPactsForTeamArgs {
  status?: "all" | "active" | "paused" | "ended";
  kind?: "all" | TriggerCategory;
}

export async function listPactsForTeam(
  teamId: string,
  args: ListPactsForTeamArgs = {}
): Promise<TeamPactRow[]> {
  const conditions = [eq(pledges.teamId, teamId)];
  if (args.status && args.status !== "all") {
    conditions.push(eq(pledges.status, args.status));
  }

  const rows = await db
    .select({
      pledgeId: pledges.id,
      pledgeStatus: pledges.status,
      monthlyCapCents: pledges.monthlyCapCents,
      sponsorId: sponsors.id,
      sponsorDisplayName: sponsorLabelSql,
      ruleId: pledgeRules.id,
      triggerType: pledgeRules.triggerType,
      amountCents: pledgeRules.amountCents,
      perMatchCapCents: pledgeRules.perMatchCapCents,
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
    .leftJoin(users, eq(sponsors.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(pledges.createdAt));

  const mapped: TeamPactRow[] = rows.map((r) => {
    const meta = (TRIGGER_META as Record<string, { label: string; emoji: string; scope: "match" | "season" } | undefined>)[
      r.triggerType
    ];
    const kind = categorize(r.triggerType);
    return {
      pledgeId: r.pledgeId,
      ruleId: r.ruleId,
      sponsorId: r.sponsorId,
      sponsorDisplayName: r.sponsorDisplayName,
      triggerType: r.triggerType,
      triggerLabel: meta?.label ?? r.triggerType,
      triggerEmoji: meta?.emoji ?? "💚",
      triggerScope: meta?.scope ?? (isSeasonTrigger(r.triggerType) ? "season" : "match"),
      triggerKind: kind,
      amountCents: r.amountCents,
      perMatchCapCents: r.perMatchCapCents,
      monthlyCapCents: r.monthlyCapCents,
      chargedCents: Number(r.chargedCents ?? 0),
      status: r.pledgeStatus
    };
  });

  if (args.kind && args.kind !== "all") {
    return mapped.filter((r) => r.triggerKind === args.kind);
  }
  return mapped;
}
