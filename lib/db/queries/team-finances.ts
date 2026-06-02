/**
 * DB-Queries für die Team-Finanzen-Page (Tab 4 im Team-Centric-Dashboard).
 *
 * "Charges" werden im Status confirmed gezählt — konsistent zur
 * Mannschaftskassen-Logik.
 */
import { and, eq, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { charges } from "@/lib/db/schema/charges";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { users } from "@/lib/db/schema/auth";
import { matches as matchesTable } from "@/lib/db/schema/matches";
import { sponsorLabelSql } from "./sponsor-label";

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
