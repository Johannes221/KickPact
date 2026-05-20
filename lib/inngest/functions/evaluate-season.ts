import { and, eq, lte, gte } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import {
  charges,
  pledges,
  pledgeRules,
  teams,
  seasonResults
} from "@/lib/db/schema";
import { isSeasonTrigger, type SeasonTriggerType } from "@/lib/db/schema/pledges";

/**
 * Saison-Wetten-Auswertung.
 *
 * Trigger: Event `season/result-set` mit `{teamId, saison}` payload.
 * Verarbeitet alle Pledges der Mannschaft, deren `pledge_rules` ein
 * Saison-Trigger sind, vergleicht mit dem `season_results`-Datensatz, und
 * erzeugt eine Charge pro erfolgreichem Trigger.
 *
 * Idempotent über `charges.unique(pledge_rule_id, saison)` — bei mehrfachen
 * Aufrufen werden keine Duplikate erzeugt.
 *
 * Manuelle Trigger (season_cup_round, season_custom) landen mit
 * status='pending_approval' damit der Sponsor sie bestätigt.
 */
export const evaluateSeason = inngest.createFunction(
  { id: "evaluate-season", name: "Evaluate Season-Wetten" },
  [{ event: "season/result-set" }],
  async ({ event, step, logger }) => {
    const { teamId, saison } = event.data as { teamId: string; saison: string };

    const [result] = await db
      .select()
      .from(seasonResults)
      .where(and(eq(seasonResults.teamId, teamId), eq(seasonResults.saison, saison)))
      .limit(1);
    if (!result) {
      logger.warn("evaluate-season: no result row found", { teamId, saison });
      return { teamId, saison, chargesCreated: 0, skipped: "no-result" };
    }

    // Lade alle aktiven pledges für diese Mannschaft + alle Saison-Trigger-Rules.
    const rows = await db
      .select({
        pledge: pledges,
        rule: pledgeRules,
        teamSaison: teams.saison
      })
      .from(pledgeRules)
      .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(
        and(
          eq(pledges.teamId, teamId),
          eq(pledges.status, "active"),
          gte(pledges.endsAt, new Date(0)),
          lte(pledges.startsAt, new Date())
        )
      );

    let chargesCreated = 0;
    let chargesSkipped = 0;
    const details: { ruleId: string; trigger: string; outcome: string }[] = [];

    for (const r of rows) {
      if (!isSeasonTrigger(r.rule.triggerType)) continue;

      const stepId = `season-charge-${r.rule.id}-${saison}`;
      await step.run(stepId, async () => {
        const triggerType = r.rule.triggerType as SeasonTriggerType;
        const params = (r.rule.triggerParamsJson ?? {}) as Record<string, unknown>;

        const hit = isTriggerHit(triggerType, params, result);
        if (!hit) {
          chargesSkipped += 1;
          details.push({ ruleId: r.rule.id, trigger: triggerType, outcome: "missed" });
          return;
        }

        const requiresApproval =
          r.rule.requiresApproval ||
          triggerType === "season_cup_round" ||
          triggerType === "season_custom";

        const insertResult = await db
          .insert(charges)
          .values({
            pledgeId: r.pledge.id,
            pledgeRuleId: r.rule.id,
            matchId: null,
            saison,
            triggerType,
            amountCents: r.rule.amountCents,
            status: requiresApproval ? "pending_approval" : "confirmed",
            confirmedAt: requiresApproval ? null : new Date()
          })
          .onConflictDoNothing()
          .returning({ id: charges.id });

        if (insertResult.length > 0) {
          chargesCreated += 1;
          details.push({
            ruleId: r.rule.id,
            trigger: triggerType,
            outcome: requiresApproval ? "pending_approval" : "confirmed"
          });
        } else {
          details.push({ ruleId: r.rule.id, trigger: triggerType, outcome: "duplicate" });
        }
      });
    }

    logger.info("evaluate-season done", {
      teamId,
      saison,
      chargesCreated,
      chargesSkipped,
      rules: rows.length
    });
    return { teamId, saison, chargesCreated, chargesSkipped, details };
  }
);

/**
 * Prüft ob ein Saison-Trigger gemäß dem End-Ergebnis hit ist.
 */
function isTriggerHit(
  trigger: SeasonTriggerType,
  params: Record<string, unknown>,
  result: typeof seasonResults.$inferSelect
): boolean {
  switch (trigger) {
    case "season_promotion":
      return result.promoted === true;
    case "season_no_relegation":
      return result.relegated === false;
    case "season_champion":
      return result.finalPosition === 1;
    case "season_table_position": {
      const minPos = numberParam(params.minPosition);
      const maxPos = numberParam(params.maxPosition);
      if (minPos == null || maxPos == null || result.finalPosition == null) return false;
      return result.finalPosition >= minPos && result.finalPosition <= maxPos;
    }
    case "season_cup_round": {
      // Manuell: Sponsor bestätigt. Wir geben Charge mit pending_approval aus
      // wenn cupRoundReached gesetzt ist; sonst false.
      const minRound = (params.minRound as string | undefined)?.toLowerCase();
      const reached = result.cupRoundReached?.toLowerCase();
      if (!minRound || !reached) return false;
      const order = [
        "vorrunde",
        "1.runde",
        "2.runde",
        "achtelfinale",
        "viertelfinale",
        "halbfinale",
        "finale",
        "sieger"
      ];
      const idxReached = order.indexOf(reached);
      const idxMin = order.indexOf(minRound);
      if (idxReached < 0 || idxMin < 0) return false;
      return idxReached >= idxMin;
    }
    case "season_custom":
      // Custom — immer pending_approval erzeugen, der Sponsor entscheidet.
      // Hit-Logic: wenn Verein Custom-Notes eingetragen hat, gilt das als "behaupteter Hit".
      return Boolean(result.customNotes);
    default:
      return false;
  }
}

function numberParam(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
