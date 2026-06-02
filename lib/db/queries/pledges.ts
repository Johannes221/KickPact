import { and, count, countDistinct, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  pledges,
  pledgeRules,
  teamLicenses,
  teams,
  clubs,
  sponsors,
  charges
} from "@/lib/db/schema";
import type { PlanKey } from "@/lib/stripe/pricing";

/**
 * Zählt unterschiedliche aktive Sponsoren auf einem Team. Pausierte und
 * abgelaufene Pledges zählen NICHT (relevant für Basic-Cap).
 */
export async function countActiveSponsorsForTeam(teamId: string): Promise<number> {
  const rows = await db
    .select({ value: countDistinct(pledges.sponsorId) })
    .from(pledges)
    .where(and(eq(pledges.teamId, teamId), eq(pledges.status, "active")));
  return rows[0]?.value ?? 0;
}

/**
 * Zählt Pledge-Rules eines Sponsors auf einem Team (über aktive Pledges).
 */
export async function countPledgeRulesForSponsorOnTeam(
  sponsorId: string,
  teamId: string
): Promise<number> {
  const rows = await db
    .select({ value: count(pledgeRules.id) })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        eq(pledges.sponsorId, sponsorId),
        eq(pledges.status, "active"),
        // Soft-gelöschte Wetten zählen nicht gegen das Plan-Limit (Migration 0040).
        eq(pledgeRules.active, true),
        // SECURITY (H4): Nur die aktuell gültige Regelversion zählt — eine durch
        // eine Reduktion abgelöste Alt-Version (effectiveUntil gesetzt) bleibt
        // zwar aktiv (für vergangene Spiele), zählt aber nicht gegen das Limit.
        isNull(pledgeRules.effectiveUntil)
      )
    );
  return rows[0]?.value ?? 0;
}

/**
 * Liefert den effektiven Plan für ein Team, mit folgender Priorität:
 *
 * 1. Direkte `team_licenses`-Row → ihren `plan` zurückgeben.
 * 2. Wenn `team_licenses.parent_club_license_id` gesetzt → den Plan der
 *    Parent-License übernehmen (Vereinslizenz-Bündelung; eine Verein-License
 *    deckt mehrere Teams ab).
 * 3. Falls keine Team-License existiert: schauen ob der Club eine
 *    `subscriptions.plan === 'verein'` mit aktivem/trialing Status hat →
 *    impliziert Verein-Plan für alle Teams.
 * 4. Default: `basic`.
 *
 * Fixt Pricing-v2-Audit #5 (parentClubLicenseId tote Spalte).
 */
export async function getTeamLicensePlan(teamId: string): Promise<PlanKey> {
  // 1) Direct license on team
  const [direct] = await db
    .select({ plan: teamLicenses.plan, parentId: teamLicenses.parentClubLicenseId })
    .from(teamLicenses)
    .where(eq(teamLicenses.teamId, teamId))
    .limit(1);

  if (direct?.plan && !direct.parentId) {
    return direct.plan as PlanKey;
  }

  // 2) Resolved via parent license
  if (direct?.parentId) {
    const [parent] = await db
      .select({ plan: teamLicenses.plan })
      .from(teamLicenses)
      .where(eq(teamLicenses.id, direct.parentId))
      .limit(1);
    if (parent?.plan) return parent.plan as PlanKey;
  }

  // 3) Verein-Plan auf irgendeiner team_license desselben Clubs → impliziert
  //    Vereinslizenz-Bündelung für alle Teams dieses Clubs.
  const [teamRow] = await db
    .select({ clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (teamRow?.clubId) {
    const [vereinLicense] = await db
      .select({ plan: teamLicenses.plan })
      .from(teamLicenses)
      .where(
        and(
          eq(teamLicenses.subscriptionClubId, teamRow.clubId),
          eq(teamLicenses.plan, "verein")
        )
      )
      .limit(1);
    if (vereinLicense?.plan === "verein") return "verein";
  }

  // 4) Default
  return (direct?.plan as PlanKey | undefined) ?? "basic";
}

/** Pacts eines Sponsors (Liste auf /sponsor/pledge), neueste zuerst. */
export async function listPledgesForSponsor(sponsorId: string) {
  return db
    .select({
      id: pledges.id,
      status: pledges.status,
      startsAt: pledges.startsAt,
      endsAt: pledges.endsAt,
      monthlyCapCents: pledges.monthlyCapCents,
      teamName: teams.name,
      clubName: clubs.name
    })
    .from(pledges)
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.sponsorId, sponsorId))
    .orderBy(desc(pledges.startsAt));
}

/**
 * Pact-Detail inkl. `sponsorUserId` für den Owner-Check (/sponsor/pledge/[id]).
 * `undefined`, wenn der Pact nicht existiert.
 */
export async function getPledgeDetailForSponsorView(pledgeId: string) {
  const [pledge] = await db
    .select({
      id: pledges.id,
      status: pledges.status,
      startsAt: pledges.startsAt,
      endsAt: pledges.endsAt,
      monthlyCapCents: pledges.monthlyCapCents,
      teamId: teams.id,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      sponsorUserId: sponsors.userId
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.id, pledgeId))
    .limit(1);
  return pledge;
}

/** Aktive Regeln eines Pacts (für den Rules-Editor). */
export async function listActivePledgeRules(pledgeId: string) {
  return db
    .select({
      id: pledgeRules.id,
      triggerType: pledgeRules.triggerType,
      amountCents: pledgeRules.amountCents,
      capCents: pledgeRules.capCents,
      capPeriod: pledgeRules.capPeriod,
      params: pledgeRules.triggerParamsJson
    })
    .from(pledgeRules)
    .where(and(eq(pledgeRules.pledgeId, pledgeId), eq(pledgeRules.active, true)));
}

/** Letzte N Charges eines Pacts, neueste zuerst. */
export async function listRecentChargesForPledge(pledgeId: string, limit = 10) {
  return db
    .select({
      id: charges.id,
      amountCents: charges.amountCents,
      status: charges.status,
      createdAt: charges.createdAt,
      matchId: charges.matchId
    })
    .from(charges)
    .where(eq(charges.pledgeId, pledgeId))
    .orderBy(desc(charges.createdAt))
    .limit(limit);
}

/** Gesamtzahl Pledges (jeden Status) einer Mannschaft — Setup-Checkliste. */
export async function countPledgesForTeam(teamId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(pledges)
    .where(eq(pledges.teamId, teamId));
  return rows[0]?.value ?? 0;
}

/** clubId einer Mannschaft (für das Read-Only-Gate im Pledge-Wizard). */
export async function getClubIdForTeam(teamId: string): Promise<string | null> {
  const [row] = await db
    .select({ clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return row?.clubId ?? null;
}

/**
 * Legt einen Pledge + seine Regeln in EINER Transaktion an. Die Rule-Rows werden
 * fertig gemappt übergeben (ohne pledgeId — die wird hier gesetzt).
 */
export async function createPledgeWithRules(args: {
  pledge: Omit<typeof pledges.$inferInsert, "id">;
  rules: Array<Omit<typeof pledgeRules.$inferInsert, "pledgeId">>;
}): Promise<{ pledgeId: string }> {
  return db.transaction(async (tx) => {
    const [pledge] = await tx.insert(pledges).values(args.pledge).returning();
    await tx
      .insert(pledgeRules)
      .values(args.rules.map((r) => ({ ...r, pledgeId: pledge.id })));
    return { pledgeId: pledge.id };
  });
}
