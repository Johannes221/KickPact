import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  pledges,
  pledgeRules,
  matches,
  charges
} from "@/lib/db/schema";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import type { PledgeRuleInput, TriggerType } from "@/lib/crawler/triggers";

/**
 * Lädt pro-Spiel Pledge-Rules für die `evaluate-match` Pipeline.
 * Filtert Saison-Trigger explizit raus — die laufen über `evaluate-season`.
 */
export async function loadActivePledgeRulesForTeam(
  teamId: string,
  asOf: Date
): Promise<PledgeRuleInput[]> {
  const rows = await db
    .select({
      ruleId: pledgeRules.id,
      pledgeId: pledgeRules.pledgeId,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents,
      perMatchCapCents: pledgeRules.perMatchCapCents,
      capCents: pledgeRules.capCents,
      capPeriod: pledgeRules.capPeriod
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        eq(pledges.status, "active"),
        // Soft-Delete: vom Sponsor gelöschte Wetten feuern nicht mehr (Migration 0040).
        eq(pledgeRules.active, true),
        lte(pledges.startsAt, asOf),
        gte(pledges.endsAt, asOf),
        // SECURITY (H4): Term-Versionierung. Eine Regel gilt nur für Spiele
        // innerhalb ihres Gültigkeitsfensters. effectiveFrom defaultet auf die
        // Epoche und effectiveUntil ist i.d.R. NULL → für unveränderte Regeln
        // immer wahr (kein Verhaltenswechsel). Wird ein Betrag/Cap reduziert,
        // bekommt die alte Regelversion ein effectiveUntil=Änderungszeitpunkt
        // und bedient damit weiterhin bereits gespielte Spiele zu den alten
        // Konditionen, während die neue (reduzierte) Version erst ab dann greift.
        lte(pledgeRules.effectiveFrom, asOf),
        sql`(${pledgeRules.effectiveUntil} IS NULL OR ${pledgeRules.effectiveUntil} > ${asOf.toISOString()})`
      )
    );

  return rows
    .filter((r) => !isSeasonTrigger(r.triggerType))
    .map((r) => ({
      id: r.ruleId,
      pledgeId: r.pledgeId,
      // Safe cast: oben filtern wir die Saison-Trigger raus, alles was übrig
      // bleibt sind die TriggerType der match-pipeline.
      triggerType: r.triggerType as TriggerType,
      triggerParams: (r.triggerParams ?? {}) as Record<string, unknown>,
      amountCents: r.amountCents,
      perMatchCapCents: r.perMatchCapCents,
      capCents: r.capCents,
      capPeriod: r.capPeriod
    }));
}

/**
 * Summe der `confirmed`+`pending_approval`+`invoiced` Charges EINER pledge_rule
 * in einem Zeitfenster — für den Perioden-Cap pro Wette (Monat/Saison).
 * Fenster über `COALESCE(confirmedAt, createdAt)`, identisch zum Pledge-Monats-Cap
 * (Konsistenz mit der Rechnungs-Periode in generate-invoices).
 *
 * `exec` akzeptiert die DB oder eine laufende Transaktion (tx), damit der
 * Cap-Check in evaluate-match atomar unter `SELECT … FOR UPDATE` laufen kann.
 */
/**
 * Liefert das Cap-Fenster `[start, end)` für eine Wette:
 *  - `month`  → Kalendermonat des Spieldatums.
 *  - `season` → Pledge-Laufzeit `[startsAt, endsAt]` (end exklusiv via +1ms).
 */
export function ruleCapWindow(
  capPeriod: "month" | "season",
  matchDate: Date,
  pledgeStartsAt: Date,
  pledgeEndsAt: Date
): { start: Date; end: Date } {
  if (capPeriod === "season") {
    return { start: pledgeStartsAt, end: new Date(pledgeEndsAt.getTime() + 1) };
  }
  return {
    start: new Date(matchDate.getFullYear(), matchDate.getMonth(), 1),
    end: new Date(matchDate.getFullYear(), matchDate.getMonth() + 1, 1)
  };
}

export async function sumRuleChargedCents(
  exec: Pick<typeof db, "select">,
  pledgeRuleId: string,
  windowStart: Date,
  windowEnd: Date
): Promise<number> {
  const [row] = await exec
    .select({ total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int` })
    .from(charges)
    .where(
      and(
        eq(charges.pledgeRuleId, pledgeRuleId),
        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${windowStart.toISOString()}`,
        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) < ${windowEnd.toISOString()}`,
        inArray(charges.status, ["confirmed", "pending_approval", "invoiced"])
      )
    );
  return row?.total ?? 0;
}

export async function getMatch(matchId: string) {
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  return m ?? null;
}

/**
 * Liefert die Summe aller `confirmed` + `pending_approval` + `invoiced` Charges
 * für einen Pledge im laufenden Monat (basierend auf asOf).
 *
 * Audit 2026-05-24 Task 2.5: Filterung über COALESCE(confirmedAt, createdAt)
 * statt rein `createdAt`. Grund: `generate-invoices` selektiert confirmed-Charges
 * via `confirmedAt`. Wenn der Cap-Check `createdAt` nutzte, konnten Spät-Confirms
 * (z.B. Sponsor bestätigt am 5. ein Approval aus dem 1.) den Cap des Vor-Monats
 * belasten, aber auf der Folge-Rechnung landen → Pledge mit monthlyCap=100€
 * konnte effektiv 200€ in einem Monat erzeugen.
 */
export async function getMonthlyChargedCents(pledgeId: string, asOf: Date): Promise<number> {
  const monthStart = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  const monthEnd = new Date(asOf.getFullYear(), asOf.getMonth() + 1, 1);
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .where(
      and(
        eq(charges.pledgeId, pledgeId),
        // COALESCE(...) ist ein rohes SQL-Fragment ohne Spalten-Typ — Drizzle
        // kann daher den Bind-Typ für ein Date nicht ableiten und postgres.js
        // wirft "Received an instance of Date". Daher Datum als ISO-String
        // binden (Postgres castet zu timestamptz).
        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${monthStart.toISOString()}`,
        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) < ${monthEnd.toISOString()}`,
        inArray(charges.status, ["confirmed", "pending_approval", "invoiced"])
      )
    );
  return row?.total ?? 0;
}

export async function getPledgeMonthlyCap(pledgeId: string): Promise<number | null> {
  const [p] = await db
    .select({ cap: pledges.monthlyCapCents })
    .from(pledges)
    .where(eq(pledges.id, pledgeId))
    .limit(1);
  return p?.cap ?? null;
}
