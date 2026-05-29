import { and, asc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  clubMemberships,
  teams,
  teamMemberships,
  sponsors,
  teamLicenses
} from "@/lib/db/schema";
import { pledges } from "@/lib/db/schema/pledges";
import { charges } from "@/lib/db/schema/charges";

export type EffectivePlan = "basic" | "pro" | "verein";

export interface UserIdentityClub {
  clubId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  role: "admin" | "trainer" | "viewer";
  teamCount: number;
  sponsorCount: number;
  /**
   * Höchster Plan über alle Team-Licenses dieses Clubs (verein > pro > basic).
   * `null`, wenn keine Team-License existiert (User hat Club ohne Subscription).
   */
  effectivePlan: EffectivePlan | null;
  /**
   * Ältestes/erstes Team dieses Clubs. Wird vom Routing benötigt, um bei
   * basic/pro-Lizenzen direkt zur Team-Page zu deep-linken.
   * `null`, wenn der Club (noch) kein Team hat.
   */
  firstTeamId: string | null;
  /**
   * Name des ersten Teams — der Header zeigt bei basic/pro-Lizenzen diesen
   * statt des Vereinsnamens, weil die Mannschaft dort der primäre Kontext ist.
   */
  firstTeamName: string | null;
}

export interface UserIdentityTeamOnly {
  teamId: string;
  teamName: string;
  clubSlug: string;
  clubName: string;
  role: "admin" | "viewer";
  saison: string;
}

export interface UserIdentitySponsor {
  id: string;
  displayName: string;
  activePledgeCount: number;
  thisMonthCents: number;
}

export interface UserIdentities {
  clubs: UserIdentityClub[];
  teamOnly: UserIdentityTeamOnly[];
  sponsor: UserIdentitySponsor | null;
}

/**
 * Aggregates all identity surfaces a user can act under: club memberships
 * (with per-club stats), team-only memberships (where the user has access
 * to a single team without club membership), and the sponsor profile.
 *
 * `teamOnly` excludes teams whose parent club is already in `clubs` —
 * club membership is always the stronger context, so a team-only card
 * for the same club would be redundant.
 */
export async function getUserIdentities(userId: string): Promise<UserIdentities> {
  // ── Clubs (with team + sponsor counts) ──────────────────────────────
  // Draft-Clubs (onboardingStatus != 'completed') werden hier raus-gefiltert,
  // damit `/dashboard` und `/select-role` den halbfertigen Wizard nicht als
  // echte Identity behandeln. Stattdessen schickt der Resume-Dispatcher
  // (`/onboarding/page.tsx`) den User zurück zur richtigen Step.
  const clubRows = await db
    .select({
      clubId: clubs.id,
      slug: clubs.slug,
      name: clubs.name,
      logoUrl: clubs.logoUrl,
      role: clubMemberships.role
    })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
    .where(
      and(
        eq(clubMemberships.userId, userId),
        eq(clubs.onboardingStatus, "completed")
      )
    );

  const clubIds = clubRows.map((r) => r.clubId);

  const [teamCounts, sponsorCountsByClub, firstTeamByClub, plansByClub] =
    await Promise.all([
      clubIds.length === 0
        ? Promise.resolve(new Map<string, number>())
        : db
            .select({
              clubId: teams.clubId,
              count: sql<number>`count(${teams.id})::int`
            })
            .from(teams)
            .where(and(inArray(teams.clubId, clubIds), eq(teams.isActive, true)))
            .groupBy(teams.clubId)
            .then(
              (rows) => new Map(rows.map((r) => [r.clubId, Number(r.count)]))
            ),
      clubIds.length === 0
        ? Promise.resolve(new Map<string, number>())
        : db
            .select({
              clubId: teams.clubId,
              count: sql<number>`count(distinct ${pledges.sponsorId})::int`
            })
            .from(pledges)
            .innerJoin(teams, eq(pledges.teamId, teams.id))
            .where(and(inArray(teams.clubId, clubIds), eq(pledges.status, "active")))
            .groupBy(teams.clubId)
            .then(
              (rows) => new Map(rows.map((r) => [r.clubId, Number(r.count)]))
            ),
      // First active team per club, ordered by created_at (oldest first).
      clubIds.length === 0
        ? Promise.resolve(new Map<string, { id: string; name: string }>())
        : db
            .select({
              clubId: teams.clubId,
              teamId: teams.id,
              teamName: teams.name,
              createdAt: teams.createdAt
            })
            .from(teams)
            .where(and(inArray(teams.clubId, clubIds), eq(teams.isActive, true)))
            .orderBy(asc(teams.createdAt), asc(teams.id))
            .then((rows) => {
              const m = new Map<string, { id: string; name: string }>();
              for (const r of rows) {
                if (!m.has(r.clubId)) m.set(r.clubId, { id: r.teamId, name: r.teamName });
              }
              return m;
            }),
      // Effective plan per club: take the strongest plan across all team_licenses
      // of the club's teams (verein > pro > basic). Returns the set of distinct
      // plans per club; resolution to the strongest happens in the mapper.
      clubIds.length === 0
        ? Promise.resolve(new Map<string, Set<EffectivePlan>>())
        : db
            .select({
              clubId: teams.clubId,
              plan: teamLicenses.plan
            })
            .from(teamLicenses)
            .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
            .where(inArray(teams.clubId, clubIds))
            .then((rows) => {
              const m = new Map<string, Set<EffectivePlan>>();
              for (const r of rows) {
                if (!r.plan) continue;
                const s = m.get(r.clubId) ?? new Set<EffectivePlan>();
                s.add(r.plan);
                m.set(r.clubId, s);
              }
              return m;
            })
    ]);

  function highestPlan(plans: Set<EffectivePlan> | undefined): EffectivePlan | null {
    if (!plans || plans.size === 0) return null;
    if (plans.has("verein")) return "verein";
    if (plans.has("pro")) return "pro";
    if (plans.has("basic")) return "basic";
    return null;
  }

  const clubsResult: UserIdentityClub[] = clubRows.map((r) => ({
    clubId: r.clubId,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    role: r.role,
    teamCount: teamCounts.get(r.clubId) ?? 0,
    sponsorCount: sponsorCountsByClub.get(r.clubId) ?? 0,
    effectivePlan: highestPlan(plansByClub.get(r.clubId)),
    firstTeamId: firstTeamByClub.get(r.clubId)?.id ?? null,
    firstTeamName: firstTeamByClub.get(r.clubId)?.name ?? null
  }));

  // ── Team-only memberships (excluding teams whose club is already above) ─
  const teamOnlyRows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      role: teamMemberships.role,
      saison: teams.saison
    })
    .from(teamMemberships)
    .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(
      clubIds.length === 0
        ? eq(teamMemberships.userId, userId)
        : and(
            eq(teamMemberships.userId, userId),
            notInArray(teams.clubId, clubIds)
          )
    );

  // ── Sponsor ─────────────────────────────────────────────────────────
  const [sponsorRow] = await db
    .select({
      id: sponsors.id,
      displayName: sponsors.displayName
    })
    .from(sponsors)
    .where(eq(sponsors.userId, userId))
    .limit(1);

  let sponsorResult: UserIdentitySponsor | null = null;
  if (sponsorRow) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [[pledgeStats], [chargeStats]] = await Promise.all([
      db
        .select({
          activePledgeCount: sql<number>`count(*) filter (where ${pledges.status} = 'active')::int`
        })
        .from(pledges)
        .where(eq(pledges.sponsorId, sponsorRow.id)),
      db
        .select({
          thisMonthCents: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
        .where(and(eq(pledges.sponsorId, sponsorRow.id), gte(charges.createdAt, monthStart)))
    ]);

    sponsorResult = {
      id: sponsorRow.id,
      displayName: sponsorRow.displayName,
      activePledgeCount: Number(pledgeStats?.activePledgeCount ?? 0),
      thisMonthCents: Number(chargeStats?.thisMonthCents ?? 0)
    };
  }

  return {
    clubs: clubsResult,
    teamOnly: teamOnlyRows,
    sponsor: sponsorResult
  };
}
