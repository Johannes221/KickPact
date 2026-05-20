import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, charges } from "@/lib/db/schema";
import { evaluateTriggers, type MatchInput } from "@/lib/crawler/triggers";
import {
  loadActivePledgeRulesForTeam,
  getMonthlyChargedCents,
  getPledgeMonthlyCap
} from "@/lib/db/queries/evaluation";

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

    // Determine teamSide via name-matching: take first significant word of team name,
    // check if heim_name contains it (case-insensitive)
    const teamFirstWord = matchData.t.name.toLowerCase().split(" ")[0];
    const heimMatch = matchData.m.heimName.toLowerCase().includes(teamFirstWord);
    const teamSide: "heim" | "gast" = heimMatch ? "heim" : "gast";

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
    for (const p of proposals) {
      const wasInserted = await step.run(
        `insert-charge-${p.pledgeRuleId}-${p.matchEventId ?? "match"}`,
        async () => {
          // Monthly-cap check
          const cap = await getPledgeMonthlyCap(p.pledgeId);
          if (cap !== null) {
            const alreadyCharged = await getMonthlyChargedCents(p.pledgeId, new Date(matchData.m.datum));
            if (alreadyCharged + p.amountCents > cap) return false;
          }

          try {
            await db.insert(charges).values({
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
