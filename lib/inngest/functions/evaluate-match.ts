import { and, eq, gte, lt, inArray, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, charges, pledges } from "@/lib/db/schema";
import { evaluateTriggers, type MatchInput } from "@/lib/crawler/triggers";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { loadActivePledgeRulesForTeam } from "@/lib/db/queries/evaluation";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";

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
      return { m, events, t };
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

    // Determine teamSide: uses all significant words (≥5 chars) from team name,
    // not just first word (which may be a role prefix like "Herren").
    const teamSide = detectTeamSide(matchData.t.name, matchData.m.heimName);

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

    let inserted = 0;
    let cappedOrSkipped = 0;
    const matchDate = new Date(matchData.m.datum);
    for (const p of proposals) {
      const wasInserted = await step.run(
        `insert-charge-${p.pledgeRuleId}-${p.matchEventId ?? "match"}`,
        async () => {
          // Audit 2026-05-25 B-1: Monthly-cap-check + insert in a single
          // transaction with SELECT … FOR UPDATE on the pledge row. Vorher
          // waren cap-read und insert nicht atomar — Inngest-concurrency=4
          // konnte parallel zwei Events lesen `alreadyCharged=X`, beide
          // unter dem cap berechnen, beide inserten → effektiver Cap-Bruch.
          try {
            return await db.transaction(async (tx) => {
              const [pledgeRow] = await tx
                .select({ id: pledges.id, cap: pledges.monthlyCapCents })
                .from(pledges)
                .where(eq(pledges.id, p.pledgeId))
                .for("update")
                .limit(1);
              if (!pledgeRow) return false;

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
                triggerType: p.triggerType,
                amountCents: p.amountCents,
                status: p.requiresApproval ? "pending_approval" : "confirmed",
                confirmedAt: p.requiresApproval ? null : new Date()
              });
              return true;
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("unique") || msg.includes("duplicate")) return false;
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
