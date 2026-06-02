import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  pledges,
  pledgeRules,
  sponsors,
  charges,
  matches,
  matchEvents,
  seasonResults,
  users
} from "@/lib/db/schema";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import { sponsorLabelSql } from "./sponsor-label";
import { isTriggerHit } from "@/lib/inngest/functions/evaluate-season";
import type { SeasonTriggerType } from "@/lib/db/schema/pledges";

export type SeasonPledgeOutcome = "fulfilled" | "missed" | "pending";

export interface ClubSeasonPledgeRow {
  pledgeId: string;
  ruleId: string;
  sponsorDisplayName: string;
  teamId: string;
  teamName: string;
  teamSaison: string;
  triggerType: SeasonTriggerType;
  triggerParams: Record<string, unknown>;
  amountCents: number;
  outcome: SeasonPledgeOutcome;
}

/**
 * Aktive Saison-Wetten quer durch den Verein. Wenn season_results für die Saison
 * der Mannschaft existieren, wird `outcome` auf "fulfilled" oder "missed" gesetzt,
 * sonst "pending".
 */
export async function listClubSeasonPledges(
  clubId: string
): Promise<ClubSeasonPledgeRow[]> {
  const teamRows = await db
    .select({ id: teams.id, name: teams.name, saison: teams.saison })
    .from(teams)
    .where(eq(teams.clubId, clubId));
  if (teamRows.length === 0) return [];
  const teamIds = teamRows.map((t) => t.id);

  const rules = await db
    .select({
      pledgeId: pledges.id,
      ruleId: pledgeRules.id,
      sponsorDisplayName: sponsorLabelSql,
      teamId: teams.id,
      teamName: teams.name,
      teamSaison: teams.saison,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(and(inArray(pledges.teamId, teamIds), eq(pledges.status, "active")));

  const seasonRules = rules.filter((r) => isSeasonTrigger(r.triggerType));
  if (seasonRules.length === 0) return [];

  // Lade alle saison-results für die Team/Saison-Kombinationen, die wir brauchen.
  const results = await db
    .select()
    .from(seasonResults)
    .where(inArray(seasonResults.teamId, teamIds));

  const resultMap = new Map<string, typeof seasonResults.$inferSelect>();
  for (const r of results) {
    resultMap.set(`${r.teamId}|${r.saison}`, r);
  }

  return seasonRules.map((r) => {
    const key = `${r.teamId}|${r.teamSaison}`;
    const result = resultMap.get(key) ?? null;
    let outcome: SeasonPledgeOutcome = "pending";
    if (result) {
      const hit = isTriggerHit(
        r.triggerType as SeasonTriggerType,
        (r.triggerParams ?? {}) as Record<string, unknown>,
        result
      );
      outcome = hit ? "fulfilled" : "missed";
    }
    return {
      pledgeId: r.pledgeId,
      ruleId: r.ruleId,
      sponsorDisplayName: r.sponsorDisplayName,
      teamId: r.teamId,
      teamName: r.teamName,
      teamSaison: r.teamSaison,
      triggerType: r.triggerType as SeasonTriggerType,
      triggerParams: (r.triggerParams ?? {}) as Record<string, unknown>,
      amountCents: r.amountCents,
      outcome
    };
  });
}

export type EreignisRow = {
  chargeId: string;
  triggerType: string;
  amountCents: number;
  status: string;
  createdAt: Date;
  matchId: string | null;
  matchDatum: Date | null;
  heimName: string | null;
  gastName: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  teamId: string | null;
  teamName: string | null;
  sponsorDisplayName: string | null;
  /** Spielername bei goal_by_player o.ä. — kommt aus matchEvents.playerName */
  playerName: string | null;
};

export async function listClubEreignisse(clubId: string): Promise<EreignisRow[]> {
  const rows = await db
    .select({
      chargeId: charges.id,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      status: charges.status,
      createdAt: charges.createdAt,
      matchId: charges.matchId,
      matchDatum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      teamId: teams.id,
      teamName: teams.name,
      sponsorDisplayName: sponsorLabelSql,
      playerName: matchEvents.playerName,
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(pledgeRules, eq(charges.pledgeRuleId, pledgeRules.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .leftJoin(matchEvents, eq(charges.matchEventId, matchEvents.id))
    .where(
      and(
        eq(teams.clubId, clubId),
        inArray(charges.status, ["confirmed", "invoiced"])
      )
    )
    .orderBy(desc(charges.createdAt));

  return rows;
}
