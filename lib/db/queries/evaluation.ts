import { and, eq, gte, lte, inArray, or, sql, type SQL } from "drizzle-orm";
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
 *
 * `sponsorId` (Paket A.2, Spec §1.2) hängt pro Rule dran, damit die
 * Insert-Pfade den Billing-Cycle-Snapshot OHNE N+1 auflösen können
 * (ein `resolveCycleAt`-Lookup pro Sponsor, nicht pro Proposal).
 */
export type PledgeRuleWithSponsor = PledgeRuleInput & { sponsorId: string };

export async function loadActivePledgeRulesForTeam(
  teamId: string,
  asOf: Date
): Promise<PledgeRuleWithSponsor[]> {
  const rows = await db
    .select({
      ruleId: pledgeRules.id,
      pledgeId: pledgeRules.pledgeId,
      sponsorId: pledges.sponsorId,
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
        // SECURITY (H4c): Auch BEENDETE Pledges bedienen noch Spiele INNERHALB
        // ihres Zeitfensters [startsAt, endsAt]. endsAt wird beim Beenden auf
        // "jetzt" gesetzt → bereits gespielte, noch nicht ausgewertete Spiele
        // werden weiter abgerechnet, künftige nicht. Vorher unterdrückte ein
        // status='active'-Filter diese legitimen Charges, sobald der Sponsor
        // nach Anpfiff (vor dem Scrape) die Wette beendete.
        //
        // AUDIT 2026-06-11 (Sommerpause-Charge-Lücke): "paused" ist NICHT
        // pauschal ausgeschlossen —
        //  - Sommerpause-Pausen (sommerpausePaused=true, Cron 1.6.) bedienen
        //    weiterhin alle Spiele im Pledge-Fenster: der Crawler sammelt bis
        //    15.6. legitime Saison-Spiele (Relegation, Nachholspiele) ein.
        //    Sonst verlieren Vereine still jede Juni-Charge (Hash unverändert
        //    → nie re-evaluiert). Standard-Pledges enden am 30.6.; bei
        //    Mehrjahres-Pledges deckt das Fenster theoretisch auch Juli-Spiele
        //    ab — die würde der active-Zweig nach dem 1.8.-Resume aber ohnehin
        //    fenster-basiert abrechnen (asOf = Spieldatum), der Zweig ändert
        //    also nur das Wann, nicht das Ob.
        //  - Manuelle Pausen bedienen Spiele VOR dem Pausen-Zeitpunkt
        //    (pausedAt), analog H4c: eine Pause nach Abpfiff, vor dem Scrape,
        //    darf die Charge des gespielten Spiels nicht unterdrücken.
        //  - Alt-Pausen ohne Marker (kein Flag, pausedAt NULL) bleiben
        //    konservativ ausgeschlossen.
        or(
          inArray(pledges.status, ["active", "ended"]),
          and(
            eq(pledges.status, "paused"),
            or(
              eq(pledges.sommerpausePaused, true),
              sql`${pledges.pausedAt} IS NOT NULL AND ${pledges.pausedAt} > ${asOf.toISOString()}`
            )
          )
        ),
        // REVIEW-BEFUND 1 (2026-06-11): pausedAt gilt STATUSUNABHÄNGIG. Wird
        // ein manuell pausierter Pledge später beendet (täglicher end-pledges-
        // Cron oder "Pact beenden"-Klick), darf der ended-Zweig (H4c) die vom
        // Sponsor bewusst weggepausten Spiele (datum >= pausedAt) nicht
        // nachträglich abrechenbar machen — Re-Evaluationen passieren real
        // (Score-Korrekturen, manuelle Events, Repair-Scripts). Reaktivierung
        // cleart pausedAt, aktive Pledges haben hier also immer NULL; der
        // Sommerpause-Fall bedient via Flag weiterhin das ganze Fenster.
        or(
          sql`${pledges.pausedAt} IS NULL`,
          sql`${pledges.pausedAt} > ${asOf.toISOString()}`,
          eq(pledges.sommerpausePaused, true)
        ),
        // SECURITY (H4b): Alt-Style-Soft-Deletes (active=false OHNE effectiveUntil,
        // Migration 0040) feuern nicht. Neu gelöschte Regeln (active=false MIT
        // effectiveUntil=Löschzeitpunkt, siehe deletePledgeRule) bleiben aber für
        // bereits gespielte Spiele in ihrem Fenster gültig — sonst könnte ein
        // Sponsor durch Löschen einer Wette nach Anpfiff die Charge unterdrücken.
        sql`NOT (${pledgeRules.active} = false AND ${pledgeRules.effectiveUntil} IS NULL)`,
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
      sponsorId: r.sponsorId,
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
 * Status, die gegen einen Cap zählen. `pending_approval` reserviert
 * Cap-Headroom (kann noch confirmed werden). Enforcement (evaluate-match)
 * UND Anzeige (getCapUsageForActivePledges) MÜSSEN exakt diese Menge nutzen —
 * sonst zeigt das Dashboard mehr Spielraum als tatsächlich durchgesetzt wird
 * und die nächste Charge wird still verworfen.
 */
export const CAP_COUNTED_STATUSES = [
  "confirmed",
  "pending_approval",
  "invoiced"
] as const;

/**
 * UTC-Kalendermonat `[start, end)` um `anchor`. UTC-Anker ist identisch zur
 * Rechnungs-Periode (lib/invoicing/period.ts) — damit driften Cap-Fenster,
 * Rechnung und Anzeige nicht bei Server-TZ≠UTC an den Monatsrändern
 * auseinander (vorher server-lokales `new Date(y,m,1)`).
 */
export function utcMonthWindow(anchor: Date): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)),
    end: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1))
  };
}

/**
 * SQL-Prädikat „diese Charge zählt gegen den Cap im Fenster `[start, end)`":
 * Anker = `COALESCE(confirmedAt, createdAt)` (Rechnung selektiert über
 * confirmedAt; Spät-Confirms belasten den Cap ihres Confirm-Monats) und Status
 * ∈ {@link CAP_COUNTED_STATUSES}. Als SQL-Fragment wiederverwendbar in einer
 * WHERE-Klausel (Enforcement) wie in einem `FILTER (WHERE …)` (Anzeige) — die
 * EINE gemeinsame Quelle, die Enforcement und Anzeige deckungsgleich hält.
 */
export function chargeCountsTowardCap(start: Date, end: Date): SQL {
  return and(
    sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) >= ${start.toISOString()}`,
    sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt}) < ${end.toISOString()}`,
    inArray(charges.status, [...CAP_COUNTED_STATUSES])
  ) as SQL;
}

/**
 * Liefert das Cap-Fenster `[start, end)` für eine Wette:
 *  - `month`  → UTC-Kalendermonat des Anker-Datums. Audit 2026-06-11 / B1:
 *    Anker ist der ABRECHNUNGSmonat (Insert-/Confirm-Zeitpunkt), nicht das
 *    Spieldatum — Caps und generate-invoices-Periode sind damit identisch
 *    dimensioniert (beide über confirmedAt). evaluate-match übergibt `now`.
 *  - `season` → Pledge-Laufzeit `[startsAt, endsAt]` (end exklusiv via +1ms).
 */
export function ruleCapWindow(
  capPeriod: "month" | "season",
  anchorDate: Date,
  pledgeStartsAt: Date,
  pledgeEndsAt: Date
): { start: Date; end: Date } {
  if (capPeriod === "season") {
    return { start: pledgeStartsAt, end: new Date(pledgeEndsAt.getTime() + 1) };
  }
  return utcMonthWindow(anchorDate);
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
        chargeCountsTowardCap(windowStart, windowEnd)
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
 *
 * `exec` (Audit 2026-06-11 / B5): akzeptiert eine laufende Transaktion, damit
 * der Cap-Check in addManualEvent die uncommitteten Inserts derselben tx
 * sieht — zwei Proposals desselben Events zählten sich sonst nicht gegenseitig.
 */
export async function getMonthlyChargedCents(
  pledgeId: string,
  asOf: Date,
  exec: Pick<typeof db, "select"> = db
): Promise<number> {
  const { start, end } = utcMonthWindow(asOf);
  const [row] = await exec
    .select({
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .where(and(eq(charges.pledgeId, pledgeId), chargeCountsTowardCap(start, end)));
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
