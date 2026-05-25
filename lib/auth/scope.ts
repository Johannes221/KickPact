import { and, asc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clubMemberships, clubs, teams, teamMemberships } from "@/lib/db/schema";
import { teamLicenses } from "@/lib/db/schema/billing";
import { requireUser } from "./session";
import {
  getSubscriptionGate,
  type SubscriptionGate
} from "@/lib/db/queries/subscription-status";

type Role = "admin" | "trainer" | "viewer";
const ROLE_RANK: Record<Role, number> = { viewer: 1, trainer: 2, admin: 3 };

export async function assertClubAccess(clubSlug: string, minRole: Role = "viewer") {
  const user = await requireUser();
  const [club] = await db
    .select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);
  // Redirect instead of throwing — prevents 500 on invalid/stale slugs
  if (!club) redirect("/dashboard");

  const [membership] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, club.id))
    )
    .limit(1);

  // Not a member or insufficient role → redirect to dashboard rather than 500
  if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    redirect("/dashboard");
  }

  return { user, club, role: membership.role };
}

export type ClubWriteAccess = Awaited<ReturnType<typeof assertClubAccess>> & {
  gate: SubscriptionGate;
};

/**
 * Wie `assertClubAccess`, blockt aber zusätzlich Schreiboperationen wenn der
 * Verein im Read-Only-Modus ist (past_due > 7d Grace oder cancelled / incomplete).
 *
 * Lesende Server-Actions sollten weiter `assertClubAccess` verwenden, damit das
 * Vereins-Dashboard im Read-Only-Modus weiter sichtbar bleibt.
 */
export async function assertClubWriteAccess(
  clubSlug: string,
  minRole: Role = "trainer"
): Promise<ClubWriteAccess> {
  const ctx = await assertClubAccess(clubSlug, minRole);
  const gate = await getSubscriptionGate(ctx.club.id);
  if (gate.isReadOnly) {
    throw new Error(
      "Diese Mannschaft ist im Read-Only-Modus. Bitte Abo reaktivieren."
    );
  }
  return { ...ctx, gate };
}

type TeamRole = "trainer" | "viewer";

const TEAM_RANK: Record<TeamRole, number> = { viewer: 1, trainer: 2 };

export type TeamAccessResult =
  | { granted: true; scope: "club"; role: Role; teamId: string; clubId: string }
  | { granted: true; scope: "team"; role: TeamRole; teamId: string; clubId: string }
  | { granted: false };

/**
 * Pure access resolver — given a user, team and minimum role, returns whether
 * the user has access and through which membership. Prefers club-scope over
 * team-scope when both exist (club role is at least as permissive).
 *
 * Tested in isolation; the auth-aware `assertTeamAccess` wraps this with
 * `requireUser` + `redirect`.
 */
export async function resolveTeamAccess(
  userId: string,
  teamId: string,
  minRole: TeamRole = "viewer"
): Promise<TeamAccessResult> {
  const [team] = await db
    .select({ id: teams.id, clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { granted: false };

  // Club-level first — admins and trainers of the parent club see everything.
  const [clubMem] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(
        eq(clubMemberships.userId, userId),
        eq(clubMemberships.clubId, team.clubId)
      )
    )
    .limit(1);
  if (clubMem) {
    if (ROLE_RANK[clubMem.role] >= ROLE_RANK[minRole]) {
      return {
        granted: true,
        scope: "club",
        role: clubMem.role,
        teamId: team.id,
        clubId: team.clubId
      };
    }
  }

  // Fall back to team-level membership.
  const [teamMem] = await db
    .select({ role: teamMemberships.role })
    .from(teamMemberships)
    .where(
      and(
        eq(teamMemberships.userId, userId),
        eq(teamMemberships.teamId, teamId)
      )
    )
    .limit(1);
  if (teamMem && TEAM_RANK[teamMem.role] >= TEAM_RANK[minRole]) {
    return {
      granted: true,
      scope: "team",
      role: teamMem.role,
      teamId: team.id,
      clubId: team.clubId
    };
  }

  return { granted: false };
}

/**
 * Page-level guard for team-scoped routes. Loads the current user, resolves
 * their access to the team, and redirects to /dashboard on failure. Returns
 * the access context for use in the page render.
 */
export async function assertTeamAccess(
  teamId: string,
  minRole: TeamRole = "viewer"
) {
  const user = await requireUser();
  const access = await resolveTeamAccess(user.id, teamId, minRole);
  if (!access.granted) redirect("/dashboard");
  return { user, ...access };
}

/**
 * Wie assertClubAccess, aber leitet User mit Mannschafts-Lizenz (basic/pro)
 * sofort zur Team-Page um. Nur Vereinslizenz-Inhaber sehen die Club-Top-
 * Routes (Dashboard / Mannschaften / Sponsoren / Ereignisse / Abrechnungen).
 *
 * Aufrufen in den Club-Top-Pages — NICHT in Sub-Routes wie /mannschaft/[teamId]
 * oder /spiel/[matchId] (dort ist der Team-Scope erlaubt).
 */
export async function assertVereinAdminOrRedirect(
  clubSlug: string,
  minRole: Role = "viewer"
) {
  const access = await assertClubAccess(clubSlug, minRole);

  // Höchsten Plan über alle team_licenses des Clubs ermitteln. "verein"
  // hat Vorrang vor "pro" hat Vorrang vor "basic".
  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, access.club.id))
    .orderBy(asc(teams.createdAt))
    .limit(50);
  if (teamRows.length === 0) return access; // Verein ohne Teams — kein Redirect

  const teamIds = teamRows.map((r) => r.id);
  const licenses = await db
    .select({ plan: teamLicenses.plan })
    .from(teamLicenses)
    .where(inArray(teamLicenses.teamId, teamIds));

  const hasVerein = licenses.some((l) => l.plan === "verein");
  if (hasVerein) return access; // Vereinslizenz aktiv → kein Redirect

  // Sonst (basic, pro, oder keine Lizenz): zur Team-Page des ersten Teams
  redirect(`/verein/${clubSlug}/mannschaft/${teamRows[0].id}`);
}

