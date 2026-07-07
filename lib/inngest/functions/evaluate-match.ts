import { and, eq, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import {
  matches,
  matchEvents,
  teams,
  charges,
  pledges,
  clubs,
  eventApprovals
} from "@/lib/db/schema";
import { evaluateTriggers, type MatchInput } from "@/lib/crawler/triggers";
import {
  applyCoverageApprovalPolicy,
  type Coverage
} from "@/lib/triggers/coverage";
import { detectTeamSide } from "@/lib/crawler/team-side";
import {
  loadActivePledgeRulesForTeam,
  sumRuleChargedCents,
  ruleCapWindow,
  utcMonthWindow,
  chargeCountsTowardCap
} from "@/lib/db/queries/evaluation";
import { resolveCyclesAt } from "@/lib/db/queries/billing-cycle";
import {
  getSubscriptionGateForTeam,
  isChargeBlockedByGate
} from "@/lib/db/queries/subscription-status";
import { isUniqueViolation } from "@/lib/db/errors";

export const evaluateMatch = inngest.createFunction(
  { id: "evaluate-match", concurrency: { limit: 4 } },
  { event: "match/finished" },
  async ({ event, step, logger }) => {
    const { matchId, teamId } = event.data as { matchId: string; teamId: string };

    const matchData = await step.run("load-match", async () => {
      const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
      if (!m) throw new Error(`match ${matchId} not found`);
      const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));
      const [t] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (!t) throw new Error(`team ${teamId} not found`);
      // Vereinsname mitladen — detectTeamSide braucht ihn als Token-Quelle, weil
      // der Mannschafts-Name (z.B. "1. Herren") oft keinen Vereins-Token enthält.
      const [c] = await db
        .select({ name: clubs.name })
        .from(clubs)
        .where(eq(clubs.id, t.clubId))
        .limit(1);
      return { m, events, t, clubName: c?.name ?? null };
    });

    // Geld-Gate (Audit 2026-06-11 / B3 + Phase 3 / R6): blockt bei
    // past_due/cancelled — NICHT bei paused. Die Saison-Pass-Sommerpause
    // pausiert nur die LIZENZ-Abbuchung; die Saison läuft bis 30.6. und
    // gespielte Spiele müssen weiter Charges erzeugen (vorher gingen alle
    // Juni-Charges pausierter Vereine still verloren). R6: ZUSÄTZLICH blockt
    // ein abgelaufener, nie bezahlter Trial (gate.reason=trial_expired) —
    // auch im Fenster, in dem expire-trials den Status noch nicht auf
    // cancelled gedreht hat. Geblockte Matches werden als
    // `match/evaluation-deferred` geloggt statt still verworfen — Forensik +
    // Re-Emit nach Reaktivierung (Admin: Spieldaten erneut einlesen) bleiben
    // möglich, weil das Match selbst unangetastet bleibt.
    // Team-scoped: effektiver Lizenz-Verein (licensedUnderClubId ?? clubId).
    // Der Container-Club des Teams kann gekündigt sein, während der Verein,
    // unter dessen Lizenz das Team läuft, zahlt — dann müssen Charges laufen.
    const gate = await step.run("gate-check", () =>
      getSubscriptionGateForTeam(teamId)
    );
    if (isChargeBlockedByGate(gate)) {
      logger.warn("match/evaluation-deferred — club unlicensed, charges not generated", {
        clubId: matchData.t.clubId,
        teamId,
        matchId,
        gateStatus: gate.status,
        gateReason: gate.reason
      });
      return { proposals: 0, inserted: 0, cappedOrSkipped: 0, skippedReadOnly: true };
    }

    // Determine teamSide: nutzt signifikante Wörter (≥5 Zeichen) aus Mannschafts-
    // UND Vereinsname. Letzterer ist nötig, weil der Mannschafts-Name (z.B.
    // "1. Herren") oft keinen identifizierenden Token enthält.
    const teamSide = detectTeamSide(
      [matchData.t.name, matchData.clubName ?? ""],
      matchData.m.heimName
    );

    const input: MatchInput = {
      id: matchData.m.id,
      teamSide,
      ergebnisHeim: matchData.m.ergebnisHeim ?? 0,
      ergebnisGast: matchData.m.ergebnisGast ?? 0,
      halbzeitHeim: matchData.m.halbzeitHeim,
      halbzeitGast: matchData.m.halbzeitGast,
      events: matchData.events.map((e) => ({
        id: e.id,
        type: e.type,
        subtype: e.subtype,
        minute: e.minute,
        side: e.side,
        playerName: e.playerName,
        playerId: e.playerId,
        source: e.source
      }))
    };

    const rules = await step.run("load-rules", () =>
      loadActivePledgeRulesForTeam(teamId, new Date(matchData.m.datum))
    );
    logger.info(`evaluate-match ${matchId}: ${rules.length} active rules`);

    // Paket A.2 (Spec §1.2): Billing-Cycle-Snapshot zum SPIELdatum. EIN
    // Lookup pro Sponsor (nicht pro Proposal); Map pledgeId→sponsorId aus
    // den geladenen Rules, Cycle-Resolution als eigener memoisierter Step.
    const sponsorByPledge = new Map(rules.map((r) => [r.pledgeId, r.sponsorId]));
    const cycleBySponsor = await step.run("resolve-billing-cycles", () =>
      resolveCyclesAt(
        rules.map((r) => r.sponsorId),
        new Date(matchData.m.datum)
      )
    );

    // Review K2 (Phase 4, 2026-06-12): coverage=none ⇒ ALLE Proposals
    // approval-pflichtig — der Endstand stammt dort vom Vereins-Override,
    // der Verein darf sich nicht selbst Geld bestätigen. Direkt-Charges
    // (matchEventId null) erreichen den Sponsor über die generische
    // Inbox-Sektion + 21d-Expiry.
    const proposals = applyCoverageApprovalPolicy(
      evaluateTriggers(input, rules),
      matchData.t.dataCoverage as Coverage | null
    );

    // Perioden-Cap pro Wette: ruleId → {capCents, capPeriod}. Enforcement DB-aware
    // unten in der Insert-Transaktion (analog Pledge-Monats-Cap).
    const ruleCapById = new Map(
      rules.map((r) => [r.id, { capCents: r.capCents ?? null, capPeriod: r.capPeriod ?? null }])
    );

    let inserted = 0;
    let cappedOrSkipped = 0;
    // Audit 2026-06-11 / B1: Cap-Anker = ABRECHNUNGSmonat (jetzt), nicht
    // Spielmonat. Caps begrenzen, was auf einer Rechnung landet — die
    // Rechnungsperiode selektiert über confirmedAt (= Insert-Zeitpunkt).
    // Vorher: Fenster nach Spieldatum, Summe nach Confirm-Zeit → zwei spät
    // gescrapte Vormonats-Spiele konnten 2× den Cap auf EINE Rechnung legen.
    // Rest-Risiko (dokumentiert, nicht gelöst): pending_approval-Charges aus
    // dem Vormonat, die erst im Folgemonat confirmed werden, belasten den
    // Cap des Erstellungs-Monats, landen aber auf der Folgemonats-Rechnung.
    const capAnchor = new Date();
    for (const p of proposals) {
      // Step-ID muss pro Proposal eindeutig sein: results_only-Tor-Charges
      // teilen sich (rule, matchEventId=null) und unterscheiden sich nur im
      // goalIndex.
      const wasInserted = await step.run(
        `insert-charge-${p.pledgeRuleId}-${p.matchEventId ?? `match-${p.goalIndex ?? 0}`}`,
        async () => {
          // Audit 2026-05-25 B-1: Monthly-cap-check + insert in a single
          // transaction with SELECT … FOR UPDATE on the pledge row. Vorher
          // waren cap-read und insert nicht atomar — Inngest-concurrency=4
          // konnte parallel zwei Events lesen `alreadyCharged=X`, beide
          // unter dem cap berechnen, beide inserten → effektiver Cap-Bruch.
          try {
            return await db.transaction(async (tx) => {
              const [pledgeRow] = await tx
                .select({
                  id: pledges.id,
                  cap: pledges.monthlyCapCents,
                  startsAt: pledges.startsAt,
                  endsAt: pledges.endsAt
                })
                .from(pledges)
                .where(eq(pledges.id, p.pledgeId))
                .for("update")
                .limit(1);
              if (!pledgeRow) return false;

              // Perioden-Cap pro Wette (Monat/Saison) — vor dem Pledge-Monats-Cap.
              const ruleCap = ruleCapById.get(p.pledgeRuleId);
              if (ruleCap?.capCents != null && ruleCap.capPeriod) {
                const { start, end } = ruleCapWindow(
                  ruleCap.capPeriod,
                  capAnchor,
                  pledgeRow.startsAt,
                  pledgeRow.endsAt
                );
                const ruleCharged = await sumRuleChargedCents(tx, p.pledgeRuleId, start, end);
                if (ruleCharged + p.amountCents > ruleCap.capCents) return false;
              }

              if (pledgeRow.cap !== null) {
                // Gemeinsame Cap-Fenster-/Status-Definition — deckungsgleich
                // mit der Anzeige (getCapUsageForActivePledges). UTC-Monat um
                // capAnchor (= now, Abrechnungsmonat), Anker
                // COALESCE(confirmedAt, createdAt), Status ∈ CAP_COUNTED_STATUSES.
                const { start, end } = utcMonthWindow(capAnchor);
                const [sumRow] = await tx
                  .select({
                    total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
                  })
                  .from(charges)
                  .where(
                    and(
                      eq(charges.pledgeId, p.pledgeId),
                      chargeCountsTowardCap(start, end)
                    )
                  );
                const alreadyCharged = sumRow?.total ?? 0;
                if (alreadyCharged + p.amountCents > pledgeRow.cap) return false;
              }

              await tx.insert(charges).values({
                pledgeId: p.pledgeId,
                pledgeRuleId: p.pledgeRuleId,
                matchId: p.matchId,
                matchEventId: p.matchEventId,
                goalIndex: p.goalIndex ?? 0,
                triggerType: p.triggerType,
                amountCents: p.amountCents,
                // Spec §1.2: Cycle zum Spielzeitpunkt einfrieren (s.o.).
                billingCycleSnapshot:
                  cycleBySponsor[sponsorByPledge.get(p.pledgeId) ?? ""] ??
                  "monthly",
                status: p.requiresApproval ? "pending_approval" : "confirmed",
                confirmedAt: p.requiresApproval ? null : new Date()
              });

              // Audit 2026-06-11 / B4: pending_approval-Charges brauchen eine
              // eventApprovals-Row, sonst kann der Sponsor nie bestätigen und
              // expire-approvals storniert nach Ablauf. addManualEvent legt
              // sie an — der Re-Eval-Pfad (z.B. nach invalidateChargesForMatch)
              // tat das nicht: Charge wurde neu erzeugt, Approval-Row fehlte.
              // Parität: expiresAt = pledges.endsAt (wie addManualEvent).
              if (p.requiresApproval && p.matchEventId) {
                const [existingApproval] = await tx
                  .select({ id: eventApprovals.id })
                  .from(eventApprovals)
                  .where(
                    and(
                      eq(eventApprovals.matchEventId, p.matchEventId),
                      eq(eventApprovals.pledgeRuleId, p.pledgeRuleId),
                      eq(eventApprovals.status, "pending")
                    )
                  )
                  .limit(1);
                if (!existingApproval) {
                  await tx.insert(eventApprovals).values({
                    matchEventId: p.matchEventId,
                    pledgeRuleId: p.pledgeRuleId,
                    status: "pending",
                    expiresAt: pledgeRow.endsAt
                  });
                }
              }
              return true;
            });
          } catch (err) {
            // Idempotenz: Unique-Kollision = Charge existiert schon → skip.
            // isUniqueViolation läuft die Cause-Kette ab, weil Drizzle den
            // Postgres-Fehler wrappt ("Failed query: …" auf Top-Level).
            if (isUniqueViolation(err)) return false;
            throw err;
          }
        }
      );
      if (wasInserted) inserted++;
      else cappedOrSkipped++;
    }

    return { proposals: proposals.length, inserted, cappedOrSkipped };
  }
);
