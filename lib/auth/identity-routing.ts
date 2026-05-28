import type { UserIdentities } from "@/lib/db/queries/user-identities";

/**
 * Discriminated union describing which identity surface a given URL belongs
 * to. Used by the header role-switcher to highlight the currently active
 * identity tile and by anywhere else that needs to ask "what role is the
 * user currently acting under?" from a pathname alone.
 *
 *  - `club`    → /verein/{slug} and all subroutes
 *  - `team`    → /verein/{slug}/mannschaft/{teamId} and all subroutes
 *  - `sponsor` → /sponsor and all subroutes
 *  - `neutral` → marketing pages, auth, /select-role, /dashboard, anything else
 */
export type ActiveIdentity =
  | { kind: "club"; slug: string }
  | { kind: "team"; slug: string; teamId: string }
  | { kind: "sponsor" }
  | { kind: "neutral" };

/**
 * Maps the user's identity snapshot to the best dashboard destination.
 *
 * Rules:
 *  - 0 identities → `/signup` (no account artefacts yet → onboarding).
 *  - Exactly 1 identity → direct deep-link into that surface.
 *  - 2+ identities → `/select-role` so the user can pick.
 *
 * Pure function — no DB, no auth, no `headers()`. Safe to call from server
 * components, server actions, or unit tests.
 */
export function pickDashboardDestination(ids: UserIdentities): string {
  const total = ids.clubs.length + ids.teamOnly.length + (ids.sponsor ? 1 : 0);
  if (total === 0) return "/signup";
  if (total >= 2) return "/select-role";

  if (ids.clubs[0]) {
    const club = ids.clubs[0];
    // Mannschafts-Lizenz (basic/pro): kein Vereins-Dashboard, sondern direkt
    // Team-Dashboard. Voraussetzung: mindestens ein Team existiert. Fällt der
    // firstTeamId-Lookup leer aus (sehr früher Onboarding-State), bleibt es
    // beim Vereins-Dashboard — der harte Redirect im Club-Layout würde sonst
    // in eine Endlos-Schleife laufen.
    if (
      (club.effectivePlan === "basic" || club.effectivePlan === "pro") &&
      club.firstTeamId
    ) {
      return `/verein/${club.slug}/mannschaft/${club.firstTeamId}`;
    }
    return `/verein/${club.slug}`;
  }
  if (ids.teamOnly[0]) {
    return `/verein/${ids.teamOnly[0].clubSlug}/mannschaft/${ids.teamOnly[0].teamId}`;
  }
  return "/sponsor";
}

// Order matters: team must be tested before club (team paths also match the
// club regex). Sponsor uses `(\/|$)` so `/sponsorXYZ` does NOT match — only
// `/sponsor` or `/sponsor/...`.
const TEAM_PATH = /^\/verein\/([^/]+)\/mannschaft\/([^/]+)/;
const CLUB_PATH = /^\/verein\/([^/]+)/;
const SPONSOR_PATH = /^\/sponsor(\/|$)/;

/**
 * Parses a Next.js pathname into the active identity it represents.
 * Pure, synchronous, allocation-light — fine to call in render paths.
 */
export function activeIdentityFromPath(pathname: string): ActiveIdentity {
  const teamMatch = pathname.match(TEAM_PATH);
  if (teamMatch) {
    return { kind: "team", slug: teamMatch[1], teamId: teamMatch[2] };
  }
  const clubMatch = pathname.match(CLUB_PATH);
  if (clubMatch) {
    return { kind: "club", slug: clubMatch[1] };
  }
  if (SPONSOR_PATH.test(pathname)) {
    return { kind: "sponsor" };
  }
  return { kind: "neutral" };
}

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

/**
 * Ein flacher, render-fertiger Eintrag im Rollen-Switcher (Header + Mobile-Nav).
 * `matches` erlaubt es, den aktuell aktiven Eintrag aus einer `ActiveIdentity`
 * (aus dem Pfad abgeleitet) zu bestimmen, ohne kind-spezifische Vergleiche
 * an der Aufrufstelle zu duplizieren.
 */
export interface IdentityEntry {
  kind: "club" | "team" | "sponsor";
  id: string;
  href: string;
  label: string;
  subline: string;
  matches: (a: ActiveIdentity) => boolean;
}

/**
 * Wandelt das Identity-Snapshot eines Users in eine flache Liste von
 * Switcher-Einträgen. Einzige Quelle der Wahrheit für Header + Mobile-Nav.
 *
 * Kern-Regel: Ein Club mit Mannschafts-Lizenz (basic/pro) erscheint NICHT als
 * Verein, sondern als Mannschaft — der Verein ist dort nur namensgebender
 * Container, der primäre Kontext ist die Mannschaft. Nur echte Vereinslizenzen
 * (`effectivePlan === "verein"`) erscheinen als Club-Eintrag.
 */
export function flattenIdentities(ids: UserIdentities): IdentityEntry[] {
  const entries: IdentityEntry[] = [];
  for (const c of ids.clubs) {
    const isSingleTeamPlan =
      c.effectivePlan === "basic" || c.effectivePlan === "pro";
    if (isSingleTeamPlan && c.firstTeamId) {
      const teamId = c.firstTeamId;
      const slug = c.slug;
      entries.push({
        kind: "team",
        id: `club-team-${teamId}`,
        href: `/verein/${slug}/mannschaft/${teamId}`,
        label: c.firstTeamName ?? c.name,
        subline: ROLE_LABEL[c.role],
        matches: (a) =>
          a.kind === "team" && a.slug === slug && a.teamId === teamId
      });
    } else {
      const slug = c.slug;
      entries.push({
        kind: "club",
        id: `club-${c.clubId}`,
        href: `/verein/${slug}`,
        label: c.name,
        subline: ROLE_LABEL[c.role],
        matches: (a) => a.kind === "club" && a.slug === slug
      });
    }
  }
  for (const t of ids.teamOnly) {
    entries.push({
      kind: "team",
      id: `team-${t.teamId}`,
      href: `/verein/${t.clubSlug}/mannschaft/${t.teamId}`,
      label: t.teamName,
      subline: `${t.clubName} · ${ROLE_LABEL[t.role]}`,
      matches: (a) =>
        a.kind === "team" && a.slug === t.clubSlug && a.teamId === t.teamId
    });
  }
  if (ids.sponsor) {
    const sp = ids.sponsor;
    entries.push({
      kind: "sponsor",
      id: `sponsor-${sp.id}`,
      href: "/sponsor",
      label: sp.displayName,
      subline: "Sponsor",
      matches: (a) => a.kind === "sponsor"
    });
  }
  return entries;
}

export function identityEmoji(kind: IdentityEntry["kind"]): string {
  if (kind === "club") return "🏟️";
  if (kind === "team") return "⚽";
  return "💚";
}
