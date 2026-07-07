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

/**
 * Guard für das Vereins-LAYOUT (`/verein/[slug]/*`). Lässt — anders als
 * `assertClubAccess` — auch reine TEAM-Mitglieder durch, die KEINE Club-
 * Mitgliedschaft haben (z.B. via genehmigter Zugriffs-Anfrage auf eine einzelne
 * fremde Mannschaft). Ohne das landeten solche User in einem Redirect-Loop:
 * Layout → /dashboard → /select-role → Rolle klicken → Layout → …
 *
 * Die FEINE Zugriffskontrolle bleibt bei den Pages: Team-Seiten nutzen
 * `assertTeamPageAccess` (team-aware), Club-Seiten ihren eigenen
 * `assertClubAccess`/`assertVereinAdminOrRedirect`-Guard. Dieser Layout-Guard
 * stellt nur sicher, dass der User ÜBERHAUPT etwas in diesem Verein darf.
 *
 * `role` ist die Club-Rolle bei Club-Mitgliedern, sonst `"viewer"` (Team-only).
 */
export async function assertVereinSectionAccess(clubSlug: string) {
  const user = await requireUser();
  const [club] = await db
    .select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);
  if (!club) redirect("/dashboard");

  // 1. Club-Mitgliedschaft? → volle Club-Rolle.
  const [clubMem] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, club.id))
    )
    .limit(1);
  if (clubMem) {
    return { user, club, role: clubMem.role, isTeamOnly: false as const };
  }

  // 2. Sonst: Team-Mitgliedschaft in IRGENDEINER Mannschaft dieses Vereins?
  const [teamMem] = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
    .where(
      and(eq(teamMemberships.userId, user.id), eq(teams.clubId, club.id))
    )
    .limit(1);
  if (teamMem) {
    return {
      user,
      club,
      role: "viewer" as Role,
      isTeamOnly: true as const,
      teamId: teamMem.teamId
    };
  }

  // 3. Weder Club- noch Team-Mitglied → kein Zugriff.
  redirect("/dashboard");
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

/**
 * Phase 3 / R8 — wie `assertClubWriteAccess`, lässt aber den Read-Only-Grund
 * "paused" (Saison-Pass-Sommerpause) durch. Gezielt NUR für Aktionen, die in
 * die Sommerpause fallen MÜSSEN — z.B. den Saison-Endstand eintragen (die
 * Saison endet am 30.6., genau dann ist der Saison-Pass pausiert).
 * past_due/cancelled/incomplete bleiben geblockt.
 */
export async function assertClubWriteAccessAllowPaused(
  clubSlug: string,
  minRole: Role = "trainer"
): Promise<ClubWriteAccess> {
  const ctx = await assertClubAccess(clubSlug, minRole);
  const gate = await getSubscriptionGate(ctx.club.id);
  if (gate.isReadOnly && gate.status !== "paused") {
    throw new Error(
      "Diese Mannschaft ist im Read-Only-Modus. Bitte Abo reaktivieren."
    );
  }
  return { ...ctx, gate };
}

type TeamRole = "admin" | "viewer";

const TEAM_RANK: Record<TeamRole, number> = { viewer: 1, admin: 2 };

/**
 * Ein Team ist „autark", wenn es eine EIGENE, gekaufte Einzel-Lizenz hat
 * (plan='basic'|'pro') OHNE Bündelung unter einer Vereinslizenz
 * (parentClubLicenseId === null). Solche Teams gehören einem eigenständigen
 * Mannschafts-Inhaber und sind dem Verein-Admin NICHT unterstellt — der Zugriff
 * kommt dort ausschließlich aus team_memberships.
 *
 * Wichtig: Ein Team OHNE Lizenz-Zeile ist NICHT autark. Es ist eine schlichte
 * Mannschaft im Vereins-Container (z.B. die noch unlizenzierte Erstmannschaft
 * eines Clubs, dessen andere Teams je eine eigene Lizenz haben). Dafür darf der
 * Club-Admin durchgreifen — sonst routet ihn die Identity-Logik in genau dieses
 * Team und der Page-Guard wirft ihn zurück → Endlos-Redirect (/dashboard ⇄ Team).
 *
 * Steuert den Club-Admin-Durchgriff: blockiert wird er NUR für autarke Teams.
 * Vereinsgeführte Teams (plan='verein' ODER parentClubLicenseId gesetzt) UND
 * lizenzlose Container-Teams sind dem Verein-Admin unterstellt.
 */
export async function isTeamAutark(teamId: string): Promise<boolean> {
  const [lic] = await db
    .select({
      plan: teamLicenses.plan,
      parentId: teamLicenses.parentClubLicenseId
    })
    .from(teamLicenses)
    .where(eq(teamLicenses.teamId, teamId))
    .limit(1);
  if (!lic) return false;
  return (lic.plan === "basic" || lic.plan === "pro") && lic.parentId === null;
}

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
    .select({
      id: teams.id,
      clubId: teams.clubId,
      licensedUnderClubId: teams.licensedUnderClubId
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { granted: false };

  // Der VEREINS-Durchgriff folgt dem effektiven Lizenz-Verein
  // (licensedUnderClubId ?? clubId) — identisch zu Gate/Billing (L1/A5). Nach
  // einem Lizenz-Transfer trägt teams.clubId weiter den Alt-Container, aber
  // licensedUnderClubId den zahlenden Verein: DER bekommt den Durchgriff, der
  // Alt-Container verliert ihn (sonst leakt der Alt-Container ein fremd-
  // lizenziertes Team bzw. der zahlende Verein käme gar nicht an sein Team).
  const controllingClubId = team.licensedUnderClubId ?? team.clubId;

  // Club-level first — admins and trainers of the controlling club see
  // everything, AUSSER autarke Teams (eigene basic/pro-Einzellizenz ohne
  // Vereinsbündelung). Die sind dem Verein-Admin nicht unterstellt; dort kommt
  // der Zugriff ausschließlich aus team_memberships (siehe unten). Lizenzlose
  // Container-Teams sind NICHT autark → Durchgriff erlaubt (sonst Redirect-Loop,
  // weil die Identity-Logik den Club-Admin in genau dieses Team routet).
  const [clubMem] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(
        eq(clubMemberships.userId, userId),
        eq(clubMemberships.clubId, controllingClubId)
      )
    )
    .limit(1);
  if (clubMem && ROLE_RANK[clubMem.role] >= ROLE_RANK[minRole]) {
    // Autark-Sperre greift NUR für den eigenen Container (kein Lizenz-Transfer).
    // Ein Verein, der das Team EXPLIZIT lizenziert (licensedUnderClubId gesetzt),
    // hat immer Durchgriff — auch im Transfer-Fenster, in dem die team_license
    // noch autark aussieht (Branding schon geflippt, Lizenz-Flip erst zum
    // Periodenende).
    const autarkBlocks =
      team.licensedUnderClubId === null && (await isTeamAutark(team.id));
    if (!autarkBlocks) {
      return {
        granted: true,
        scope: "club",
        role: clubMem.role,
        teamId: team.id,
        // Der Club-Scope läuft über den KONTROLLIERENDEN Verein: der Lizenz-
        // Verein-Admin navigiert das Team unter SEINEM Slug (sonst würde ihn der
        // Vereins-Layout-Guard assertVereinSectionAccess unter dem Alt-Container-
        // Slug rauswerfen). Die DB-Spalte teams.clubId bleibt unberührt
        // (Entscheidung A5: kein Re-Home) — nur der Zugriffs-/URL-Kontext folgt
        // der Lizenz. Team-Mitglieder behalten unten den Container-Slug.
        clubId: controllingClubId
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

export type TeamPageAccessDecision =
  | { kind: "denied" }
  | { kind: "redirect-slug"; correctSlug: string }
  | {
      kind: "granted";
      access: TeamAccessResult & { granted: true };
      club: { id: string; slug: string; name: string };
    };

/**
 * Pure resolver für die Team-Page-Routen — kapselt Berechtigungs-Check +
 * Slug-Cosmetic-Match. Auth-frei testbar; `assertTeamPageAccess` wickelt das
 * mit `requireUser` + `redirect` zur Page-Guard-Variante.
 */
export async function resolveTeamPageAccess(
  userId: string,
  clubSlug: string,
  teamId: string,
  minRole: TeamRole = "viewer"
): Promise<TeamPageAccessDecision> {
  const access = await resolveTeamAccess(userId, teamId, minRole);
  if (!access.granted) return { kind: "denied" };

  const [club] = await db
    .select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.id, access.clubId))
    .limit(1);
  if (!club) return { kind: "denied" };

  if (club.slug !== clubSlug) {
    return { kind: "redirect-slug", correctSlug: club.slug };
  }

  return { kind: "granted", access, club };
}

/**
 * Page-Guard für /verein/[slug]/mannschaft/[teamId]/*-Routen.
 *
 * Kombiniert assertTeamAccess (Berechtigung auf das konkrete Team) mit einem
 * Slug-Cosmetic-Check: falls die URL einen Slug enthält, der nicht zum Verein
 * des Teams gehört, wird auf die korrekte URL umgeleitet. Verhindert sowohl
 * das Sibling-Team-Datenleck (Team-Trainer von A sah Team B) als auch
 * URL-Mismatch (z.B. fremder Verein-Slug + eigenes Team).
 *
 * Gibt den vollen Access-Context inkl. {club: {id, slug, name}} zurück,
 * damit Pages den Club für UI/Links nutzen können ohne extra DB-Lookup.
 */
export async function assertTeamPageAccess(
  clubSlug: string,
  teamId: string,
  minRole: TeamRole = "viewer"
) {
  const user = await requireUser();
  const decision = await resolveTeamPageAccess(user.id, clubSlug, teamId, minRole);

  if (decision.kind === "denied") redirect("/dashboard");
  if (decision.kind === "redirect-slug") {
    redirect(`/verein/${decision.correctSlug}/mannschaft/${teamId}`);
  }

  return { user, ...decision.access, club: decision.club };
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

/**
 * Darf der User die Mitglieder (Mannschaftsadmins/Viewer) dieser Mannschaft
 * verwalten? Zentrale „volle Delegation"-Regel (Spec 2026-05-29 §5.1):
 *
 *   - direkter team_memberships-Admin dieses Teams, ODER
 *   - Club-Admin eines Clubs, unter dessen Vereinslizenz das Team läuft.
 *
 * Auth-frei testbar; nimmt userId statt requireUser, damit der Helper in
 * Unit-Tests ohne Session aufrufbar ist.
 */
export async function canManageTeamMembers(
  userId: string,
  teamId: string
): Promise<boolean> {
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
  if (teamMem?.role === "admin") return true;

  const [team] = await db
    .select({ clubId: teams.clubId, licensedUnderClubId: teams.licensedUnderClubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return false;

  // Wie resolveTeamAccess: die Verwaltungs-Delegation folgt dem effektiven
  // Lizenz-Verein (licensedUnderClubId ?? clubId), nicht dem Alt-Container.
  const controllingClubId = team.licensedUnderClubId ?? team.clubId;
  const [clubMem] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(
        eq(clubMemberships.userId, userId),
        eq(clubMemberships.clubId, controllingClubId)
      )
    )
    .limit(1);
  const autarkBlocks =
    team.licensedUnderClubId === null && (await isTeamAutark(teamId));
  if (clubMem?.role === "admin" && !autarkBlocks) {
    return true;
  }
  return false;
}

