/**
 * DB-Queries für die Team-Finanzen-Page (Tab 4 im Team-Centric-Dashboard).
 *
 * Liefert KPI-Aggregate auf Team-Ebene, gefiltert über ein optionales
 * Zeitfenster. "Charges" werden im Status confirmed+invoiced gezählt
 * (pending_approval/cancelled bleiben aussen vor) — das ist konsistent zu
 * `club-dashboard.ts` und der Mannschaftskassen-Logik.
 */
import { and, eq, sql, gte, lte, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges } from "@/lib/db/schema/charges";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { users } from "@/lib/db/schema/auth";
import { matches as matchesTable } from "@/lib/db/schema/matches";
import { sponsorLabelSql } from "./sponsor-label";
import type { TriggerCategory } from "@/lib/billing/trigger-categories";
import {
  TRIGGER_TYPES_BY_CATEGORY,
  categorize
} from "@/lib/billing/trigger-categories";

export interface TeamFinancesPeriod {
  /** Inclusive lower bound für `charges.createdAt`. */
  from: Date;
  /** Exclusive upper bound für `charges.createdAt`. */
  to: Date;
}

export interface TeamFinancesSummary {
  /** Σ amountCents im Filter-Fenster (confirmed + invoiced). */
  totalCents: number;
  /** Anzahl Charge-Events im Fenster. */
  eventsCount: number;
  /**
   * Σ amountCents im EXAKT gleich grossen Fenster davor (für „±X € vs.
   * letzter Periode"-Vergleich). `to - from` wird symmetrisch nach hinten
   * verschoben.
   */
  prevPeriodCents: number;
}

const ACTIVE_CHARGE_STATUSES = ["confirmed", "invoiced"] as const;

export async function getTeamFinancesSummary(
  teamId: string,
  period: TeamFinancesPeriod
): Promise<TeamFinancesSummary> {
  const windowMs = period.to.getTime() - period.from.getTime();
  const prevFrom = new Date(period.from.getTime() - windowMs);
  const prevTo = period.from;

  const [curr] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
      count: sql<number>`COUNT(*)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...ACTIVE_CHARGE_STATUSES]),
        gte(charges.createdAt, period.from),
        lte(charges.createdAt, period.to)
      )
    );

  const [prev] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...ACTIVE_CHARGE_STATUSES]),
        gte(charges.createdAt, prevFrom),
        lte(charges.createdAt, prevTo)
      )
    );

  return {
    totalCents: Number(curr?.total ?? 0),
    eventsCount: Number(curr?.count ?? 0),
    prevPeriodCents: Number(prev?.total ?? 0)
  };
}

export interface TriggerKpi {
  triggerType: string;
  sumCents: number;
  count: number;
  /** Letzte 6 Monate als €-Werte (nicht cents) — für Sparkline. */
  sparkline: number[];
}

export interface TeamFinancesByCategory {
  auto: TriggerKpi[];
  manual: TriggerKpi[];
  season: TriggerKpi[];
}

/**
 * Liefert pro Trigger-Typ Σ + Count + Sparkline im Filter-Fenster.
 *
 * Trigger-Typen ohne Charges werden ebenfalls zurückgegeben (Wert = 0). So
 * sieht der Benutzer auf einen Blick, welche Trigger noch nicht "gegriffen"
 * haben.
 */
export async function getTeamFinancesByTriggerCategory(
  teamId: string,
  period: TeamFinancesPeriod
): Promise<TeamFinancesByCategory> {
  // Σ + Count je Trigger im Fenster
  const totals = await db
    .select({
      triggerType: charges.triggerType,
      sumCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
      count: sql<number>`COUNT(*)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...ACTIVE_CHARGE_STATUSES]),
        gte(charges.createdAt, period.from),
        lte(charges.createdAt, period.to)
      )
    )
    .groupBy(charges.triggerType);

  // Sparkline = monthly buckets über letzte 6 Monate ab `to`.
  const sparklineMonths = 6;
  const sparklineEnd = period.to;
  const sparklineStart = new Date(
    sparklineEnd.getFullYear(),
    sparklineEnd.getMonth() - (sparklineMonths - 1),
    1
  );

  const sparklineRows = await db
    .select({
      triggerType: charges.triggerType,
      month: sql<string>`to_char(${charges.createdAt}, 'YYYY-MM')`,
      sumCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...ACTIVE_CHARGE_STATUSES]),
        gte(charges.createdAt, sparklineStart),
        lte(charges.createdAt, sparklineEnd)
      )
    )
    .groupBy(charges.triggerType, sql`to_char(${charges.createdAt}, 'YYYY-MM')`);

  const sparklineMap = new Map<string, Map<string, number>>();
  for (const r of sparklineRows) {
    const m = sparklineMap.get(r.triggerType) ?? new Map<string, number>();
    m.set(r.month, Number(r.sumCents));
    sparklineMap.set(r.triggerType, m);
  }

  const buildSparkline = (triggerType: string): number[] => {
    const byMonth = sparklineMap.get(triggerType) ?? new Map<string, number>();
    const out: number[] = [];
    for (let i = 0; i < sparklineMonths; i++) {
      const d = new Date(
        sparklineEnd.getFullYear(),
        sparklineEnd.getMonth() - (sparklineMonths - 1 - i),
        1
      );
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      out.push((byMonth.get(key) ?? 0) / 100);
    }
    return out;
  };

  const totalsMap = new Map(
    totals.map((t) => [
      t.triggerType,
      { sum: Number(t.sumCents), count: Number(t.count) }
    ])
  );

  const buildCategory = (cat: TriggerCategory): TriggerKpi[] => {
    const ordered = TRIGGER_TYPES_BY_CATEGORY[cat];
    const seen = new Set<string>();
    const result: TriggerKpi[] = [];
    for (const tt of ordered) {
      seen.add(tt);
      const t = totalsMap.get(tt);
      result.push({
        triggerType: tt,
        sumCents: t?.sum ?? 0,
        count: t?.count ?? 0,
        sparkline: buildSparkline(tt)
      });
    }
    // Falls Schema-Drift dazu führt, dass ein Trigger in `totals` auftaucht,
    // der nicht in der Liste steht, NICHT verlieren — hinten anhängen falls
    // er dieser Kategorie zugeordnet wird.
    for (const [tt, v] of totalsMap.entries()) {
      if (seen.has(tt)) continue;
      if (categorize(tt) !== cat) continue;
      result.push({
        triggerType: tt,
        sumCents: v.sum,
        count: v.count,
        sparkline: buildSparkline(tt)
      });
    }
    return result;
  };

  return {
    auto: buildCategory("auto"),
    manual: buildCategory("manual"),
    season: buildCategory("season")
  };
}

export interface TopSponsorRow {
  sponsorId: string;
  displayName: string;
  totalCents: number;
  eventsCount: number;
}

/**
 * Top-N Sponsoren auf einer Mannschaft, sortiert nach Σ Charges. Default 10.
 */
export async function getTopSponsorsForTeam(
  teamId: string,
  period: TeamFinancesPeriod,
  limit = 10
): Promise<TopSponsorRow[]> {
  const rows = await db
    .select({
      sponsorId: sponsors.id,
      displayName: sponsorLabelSql,
      totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`,
      eventsCount: sql<number>`COUNT(*)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...ACTIVE_CHARGE_STATUSES]),
        gte(charges.createdAt, period.from),
        lte(charges.createdAt, period.to)
      )
    )
    .groupBy(sponsors.id, sponsors.displayName, users.name, users.email)
    .orderBy(sql`SUM(${charges.amountCents}) DESC NULLS LAST`)
    .limit(limit);

  return rows.map((r) => ({
    sponsorId: r.sponsorId,
    displayName: r.displayName,
    totalCents: Number(r.totalCents ?? 0),
    eventsCount: Number(r.eventsCount ?? 0)
  }));
}

export interface MonthBucket {
  /** "YYYY-MM" */
  month: string;
  cents: number;
}

/**
 * Monatliche Charges-Summe der letzten N Monate auf einem Team. Fehlende
 * Monate werden als 0 zurückgegeben — die Reihe hat IMMER N Punkte.
 */
export async function getMonthlyChargesForTeam(
  teamId: string,
  monthsBack = 12
): Promise<MonthBucket[]> {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);

  const rows = await db
    .select({
      month: sql<string>`to_char(${charges.createdAt}, 'YYYY-MM')`,
      cents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...ACTIVE_CHARGE_STATUSES]),
        gte(charges.createdAt, start)
      )
    )
    .groupBy(sql`to_char(${charges.createdAt}, 'YYYY-MM')`);

  const map = new Map(rows.map((r) => [r.month, Number(r.cents)]));
  const out: MonthBucket[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ month: key, cents: map.get(key) ?? 0 });
  }
  return out;
}

/**
 * Helper: liefert {from, to} für eine der vorgegebenen Periode-Optionen, die
 * die Finanzen-Page als Filter anbietet.
 *
 * - "current-season" → 1. Juli des laufenden Saison-Jahres bis 1. Juli des Folgejahres
 * - "last-season"    → Vorige Saison (Juli–Juli)
 * - "all-time"       → 2000-01-01 bis heute+1 (effektiv unbegrenzt)
 */
export type FinancesPeriodOption = "current-season" | "last-season" | "all-time";

export function getPeriodForOption(
  option: FinancesPeriodOption,
  now: Date = new Date()
): TeamFinancesPeriod {
  const isAfterJuly = now.getMonth() >= 6;
  const currentSeasonStartYear = isAfterJuly ? now.getFullYear() : now.getFullYear() - 1;

  switch (option) {
    case "current-season": {
      return {
        from: new Date(currentSeasonStartYear, 6, 1),
        to: new Date(currentSeasonStartYear + 1, 6, 1)
      };
    }
    case "last-season": {
      return {
        from: new Date(currentSeasonStartYear - 1, 6, 1),
        to: new Date(currentSeasonStartYear, 6, 1)
      };
    }
    case "all-time": {
      return {
        from: new Date(2000, 0, 1),
        to: new Date(now.getFullYear() + 1, 0, 1)
      };
    }
  }
}

/**
 * Alle confirmed Charges einer Mannschaft als Einzelzeilen (Trigger-Type +
 * Sponsor + Match-Datum) — Quelle fürs Finanzen-Dashboard (Kategorie-Gruppierung
 * + Trend-Chart).
 */
export async function getTeamConfirmedChargeRuleSums(teamId: string) {
  return db
    .select({
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: charges.amountCents,
      sponsorDisplayName: sponsorLabelSql,
      matchDate: matchesTable.datum,
      confirmedAt: charges.confirmedAt
    })
    .from(charges)
    .innerJoin(pledgeRules, eq(charges.pledgeRuleId, pledgeRules.id))
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .leftJoin(matchesTable, eq(charges.matchId, matchesTable.id))
    .where(and(eq(pledges.teamId, teamId), eq(charges.status, "confirmed")));
}

/**
 * Alle Pact-Regeln einer Mannschaft (Rule + Pledge-Status + Sponsor +
 * Σ confirmed Charges pro Rule), nach Betrag absteigend — für den Pacts-Tab.
 */
export async function listTeamPactRuleRows(teamId: string) {
  return db
    .select({
      pledgeId: pledges.id,
      ruleId: pledgeRules.id,
      pledgeStatus: pledges.status,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents,
      perMatchCapCents: pledgeRules.perMatchCapCents,
      monthlyCapCents: pledges.monthlyCapCents,
      sponsorDisplayName: sponsorLabelSql,
      chargedSum: sql<number>`COALESCE((SELECT SUM(amount_cents) FROM ${charges} c WHERE c.pledge_rule_id = ${pledgeRules.id} AND c.status = 'confirmed'), 0)`
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .where(eq(pledges.teamId, teamId))
    .orderBy(desc(pledgeRules.amountCents));
}
