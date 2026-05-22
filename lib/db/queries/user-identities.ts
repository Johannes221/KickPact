import { and, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  clubMemberships,
  teams,
  teamMemberships,
  sponsors
} from "@/lib/db/schema";
import { pledges } from "@/lib/db/schema/pledges";
import { charges } from "@/lib/db/schema/charges";

export interface UserIdentityClub {
  clubId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  role: "admin" | "trainer" | "viewer";
  teamCount: number;
  sponsorCount: number;
}

export interface UserIdentityTeamOnly {
  teamId: string;
  teamName: string;
  clubSlug: string;
  clubName: string;
  role: "trainer" | "viewer";
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
    .where(eq(clubMemberships.userId, userId));

  const clubIds = clubRows.map((r) => r.clubId);

  const [teamCounts, sponsorCountsByClub] = await Promise.all([
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
          )
  ]);

  const clubsResult: UserIdentityClub[] = clubRows.map((r) => ({
    clubId: r.clubId,
    slug: r.slug,
    name: r.name,
    logoUrl: r.logoUrl,
    role: r.role,
    teamCount: teamCounts.get(r.clubId) ?? 0,
    sponsorCount: sponsorCountsByClub.get(r.clubId) ?? 0
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
