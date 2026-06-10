import { and, eq, gte, lt, inArray, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, charges, pledges, clubs } from "@/lib/db/schema";
import { evaluateTriggers, type MatchInput } from "@/lib/crawler/triggers";
import { detectTeamSide } from "@/lib/crawler/team-side";
import {
  loadActivePledgeRulesForTeam,
  sumRuleChargedCents,
  ruleCapWindow
} from "@/lib/db/queries/evaluation";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
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

    // Read-Only-Gate: keine neuen Charges für pausierte Vereine.
    const gate = await step.run("gate-check", () =>
      getSubscriptionGate(matchData.t.clubId)
    );
    if (gate.isReadOnly) {
      logger.info("skipped because club is read-only", {
        clubId: matchData.t.clubId,
        teamId
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

    const proposals = evaluateTriggers(input, rules);

    // Perioden-Cap pro Wette: ruleId → {capCents, capPeriod}. Enforcement DB-aware
    // unten in der Insert-Transaktion (analog Pledge-Monats-Cap).
    const ruleCapById = new Map(
      rules.map((r) => [r.id, { capCents: r.capCents ?? null, capPeriod: r.capPeriod ?? null }])
    );

    let inserted = 0;
    let cappedOrSkipped = 0;
    const matchDate = new Date(matchData.m.datum);
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
                  matchDate,
                  pledgeRow.startsAt,
                  pledgeRow.endsAt
                );
                const ruleCharged = await sumRuleChargedCents(tx, p.pledgeRuleId, start, end);
                if (ruleCharged + p.amountCents > ruleCap.capCents) return false;
              }

              if (pledgeRow.cap !== null) {
                const monthStart = new Date(
                  matchDate.getFullYear(),
                  matchDate.getMonth(),
                  1
                );
                const monthEnd = new Date(
                  matchDate.getFullYear(),
                  matchDate.getMonth() + 1,
                  1
                );
                const [sumRow] = await tx
                  .select({
                    total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
                  })
                  .from(charges)
                  .where(
                    and(
                      eq(charges.pledgeId, p.pledgeId),
                      gte(
                        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt})`,
                        monthStart
                      ),
                      lt(
                        sql`COALESCE(${charges.confirmedAt}, ${charges.createdAt})`,
                        monthEnd
                      ),
                      inArray(charges.status, [
                        "confirmed",
                        "pending_approval",
                        "invoiced"
                      ])
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
                status: p.requiresApproval ? "pending_approval" : "confirmed",
                confirmedAt: p.requiresApproval ? null : new Date()
              });
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
