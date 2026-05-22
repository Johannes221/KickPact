# Identity, Roles & Mobile IA Refactor — Design Spec

**Date:** 2026-05-22
**Status:** approved-for-planning
**Author:** Johannes + Claude (brainstorming session)

## 1. Problem Statement

KickPact's current identity/onboarding flow has three structural gaps that cost trust and onboarding completion:

1. **No multi-role awareness.** A logged-in user who happens to already have a club membership *still* gets redirected to `/onboarding/verein/1` after a fresh magic-link sign-in, because we don't check existing memberships before routing.
2. **No team-level access.** A trainer of the C-Jugend cannot get scoped access to *just that team* — they have to be made club-admin, which leaks Sponsoren/Abo/Einstellungen they shouldn't see.
3. **No duplicate-protection on Verein/Mannschaft claims.** If a Verein has already been onboarded by someone else, the onboarding flow hits a unique-constraint failure with no graceful path. There is no "request access" flow.

Plus a mobile-IA problem: the `/verein/{slug}` sub-nav has 6 tabs that horizontally scroll. The 5th and 6th tab (Abo, Einstellungen) are off-screen and users don't discover them.

## 2. Goals

After this work ships, the following must be true:

- A user with **N identities** (clubs, teams, sponsor) can pick which one to act as immediately after login, without being incorrectly dropped into onboarding.
- A **team trainer** can be granted access to one team only, without seeing siblings.
- Trying to claim a **Verein that's already in the database** opens a clean "Request access" flow; the user never sees a 500.
- Mobile users can **reach every section** of a Vereins-Dashboard without horizontal scrolling.
- The Vereins-Dashboard and the Sponsor-Dashboard both present their primary content as **tappable tiles**, with overflow on dedicated sub-pages.

## 3. Out of Scope

- Merging two existing user accounts (e.g., `johannes.schartl@gmail.com` and `johannes@verein.de` → one identity). Email = identity stays. Documented in the login copy: "Use the email you signed up with."
- Multi-sponsor identities per user (one user = one sponsor profile, `type=familie|business` differentiates).
- Support-escalation UI for orphaned Vereine after N days of admin silence. Email fallback only. Out-of-scope for Phase 1.
- OAuth account linking (linking a magic-link account to a later Google/Apple sign-in). Existing better-auth defaults remain.

## 4. Identity & Role Model

### 4.1 Identity types

```
User (auth.users)
 ├─ N × ClubMembership  →  Club  (M:N, role: admin|trainer|viewer)
 ├─ N × TeamMembership  →  Team  (M:N, role: trainer|viewer)   ← NEW
 └─ 0/1 × Sponsor       →  Sponsor profile (1:1, type: familie|business)
```

### 4.2 New table: `team_memberships`

```ts
export const teamMemberRoleEnum = pgEnum("team_member_role", ["trainer", "viewer"]);

export const teamMemberships = pgTable("team_memberships", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  role: teamMemberRoleEnum("role").notNull().default("trainer"),
  invitedByUserId: text("invited_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.teamId] }),
  teamIdx: index("team_memberships_team_idx").on(t.teamId)
}));
```

Located in `lib/db/schema/clubs.ts` alongside existing `clubMemberships`. Migration generated via `npm run db:generate`.

### 4.3 Effective permissions

Permissions are the **union** across all three identity sources. For a given `(userId, clubId, teamId)` request, the resolver picks the strongest role:

| Source                                  | Reads      | Writes (events) | Sponsoren | Abrechnungen | Abo / Einstellungen |
| --------------------------------------- | ---------- | --------------- | --------- | ------------ | ------------------- |
| `clubMemberships.role = admin`          | all teams  | all teams       | yes       | yes          | yes                 |
| `clubMemberships.role = trainer`        | all teams  | all teams       | yes       | yes (read)   | no                  |
| `clubMemberships.role = viewer`         | all teams  | no              | read      | read         | no                  |
| `teamMemberships.role = trainer`        | one team   | one team        | one team  | one team (r) | no                  |
| `teamMemberships.role = viewer`         | one team   | no              | one team  | no           | no                  |

Team-Trainer sees the Sponsoren tab scoped to their team — they can copy the team's invitation link, see who pledged, but cannot edit sponsors of other teams.

### 4.4 New scope helpers

```ts
// lib/auth/scope.ts

export async function assertTeamAccess(teamId: string, minRole: "viewer" | "trainer" = "viewer") {
  const user = await requireUser();
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
  if (!team) redirect("/dashboard");

  // Try club-level first (admin > trainer > viewer)
  const [clubMem] = await db.select().from(clubMemberships)
    .where(and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, team.clubId))).limit(1);
  if (clubMem && rankClub(clubMem.role) >= rankClub(minRole === "trainer" ? "trainer" : "viewer")) {
    return { user, team, scope: "club" as const, role: clubMem.role };
  }

  // Fall back to team-level
  const [teamMem] = await db.select().from(teamMemberships)
    .where(and(eq(teamMemberships.userId, user.id), eq(teamMemberships.teamId, teamId))).limit(1);
  if (teamMem && rankTeam(teamMem.role) >= rankTeam(minRole)) {
    return { user, team, scope: "team" as const, role: teamMem.role };
  }

  redirect("/dashboard");
}
```

`assertClubAccess` stays as-is. Page-level callers pick the helper that matches their scope (Team-pages → `assertTeamAccess`; Club-overview pages → `assertClubAccess`).

## 5. Smart Post-Login Routing

### 5.1 New endpoint: `/api/user/roles`

Returns the user's full identity snapshot. The `/dashboard` Server Component reads it directly via a query helper (not over HTTP) — the endpoint is for the header `HeaderUserMenu`.

```ts
// lib/db/queries/user-identities.ts
export interface UserIdentities {
  clubs: Array<{ clubId: string; slug: string; name: string; logoUrl: string | null; role: "admin" | "trainer" | "viewer"; teamCount: number; sponsorCount: number }>;
  teamOnly: Array<{ teamId: string; teamName: string; clubSlug: string; clubName: string; role: "trainer" | "viewer"; saison: string }>;
  sponsor: { id: string; displayName: string; activePledgeCount: number; thisMonthCents: number } | null;
}

export async function getUserIdentities(userId: string): Promise<UserIdentities> { ... }
```

`teamOnly` only contains teams where the user has a `teamMembership` AND **no** `clubMembership` to the parent club (otherwise the club-level role already grants access; the team isn't a separate identity).

### 5.2 `/dashboard` redirect logic

```ts
// app/dashboard/page.tsx
const ids = await getUserIdentities(user.id);
const total = ids.clubs.length + ids.teamOnly.length + (ids.sponsor ? 1 : 0);

if (total === 0) redirect("/signup");                                       // 0 → onboard
if (total === 1) {
  if (ids.clubs[0]) redirect(`/verein/${ids.clubs[0].slug}`);
  if (ids.teamOnly[0]) redirect(`/verein/${ids.teamOnly[0].clubSlug}/mannschaft/${ids.teamOnly[0].teamId}`);
  if (ids.sponsor) redirect("/sponsor");
}
redirect("/select-role");                                                   // 2+ → picker
```

### 5.3 New page: `/select-role`

Server Component. Calls `getUserIdentities` and renders one card per identity, plus a "+ Neue Rolle hinzufügen" card → `/signup`. Reused tile component (see §8).

Card content:

- **Club card**: `🏟️ {clubName}` + role pill (`Admin` / `Trainer` / `Viewer`). Subtext: `{teamCount} Mannschaften · {sponsorCount} Sponsoren`. Click → `/verein/{slug}`.
- **Team-only card**: `⚽ {teamName}` + role pill. Subtext: `{clubName} · Saison {saison}`. Click → `/verein/{clubSlug}/mannschaft/{teamId}`.
- **Sponsor card**: `💚 {displayName}` (or `Sponsor`). Subtext: `{activePledgeCount} aktive Pledges · {eur(thisMonthCents)} diesen Monat`. Click → `/sponsor`.
- **Add-role card**: dashed border. `+ Neue Rolle` → `/signup`.

### 5.4 Header role-switcher

`HeaderUserMenu` dropdown gains a "Wechseln zu"-section showing all other identities, plus a `+ Neue Rolle` link → `/signup`. Active identity inferred from URL:

```ts
function activeIdentityFromPath(pathname: string): "club" | "team" | "sponsor" | "neutral" {
  if (pathname.startsWith("/sponsor")) return "sponsor";
  if (/^\/verein\/[^/]+\/mannschaft\//.test(pathname)) return "team";
  if (pathname.startsWith("/verein/")) return "club";
  return "neutral";
}
```

No session-state, no cookies. The URL is the source of truth.

## 6. Duplicate-Detection & Access Request

### 6.1 Verein search marks claimed Vereine

`searchVereineAction` in `app/(onboarding)/onboarding/verein/_actions/search.ts` joins each fußball.de hit against the `clubs` table by `fussballdeVereinId`. New return shape:

```ts
type VereinHit = {
  name: string;
  ort: string | null;
  slug: string;
  vereinId: string;
  url: string;
  isAlreadyClaimed: boolean;       // NEW: true if clubs.fussballdeVereinId already exists
  claimedClubSlug: string | null;  // NEW: the KickPact slug of the existing club
};
```

The UI in `search-step.tsx` renders claimed results with a lock icon, a "Schon registriert" badge, and "Zugriff anfragen →" CTA instead of "Weiter →".

### 6.2 New page: `/onboarding/zugriff-anfragen`

Query params: `clubSlug` (required), `teamId` (optional). Form fields:

- **Requested role**: `admin` / `trainer` / `viewer` (radio). For team-scoped requests (teamId set), only `trainer` / `viewer`.
- **Scope** (only shown if `teamId` absent): "Ganzer Verein" or "Nur eine Mannschaft" → if "nur eine Mannschaft", select dropdown of teams.
- **Nachricht** (textarea, optional, 280 chars): why you want access.
- Submit → server action creates `clubMembershipRequests` row, sends mail to all club admins via Resend.
- Success screen: "Anfrage gestellt — du bekommst eine Mail, sobald dein Zugriff freigegeben ist."

### 6.3 New table: `club_membership_requests`

```ts
export const requestStatusEnum = pgEnum("club_membership_request_status", ["pending", "approved", "rejected"]);

export const clubMembershipRequests = pgTable("club_membership_requests", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
  requestedRole: memberRoleEnum("requested_role").notNull(),
  requestedTeamId: text("requested_team_id").references(() => teams.id, { onDelete: "cascade" }),
  message: text("message"),
  status: requestStatusEnum("status").notNull().default("pending"),
  responseMessage: text("response_message"),
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  respondedByUserId: text("responded_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  uniquePending: uniqueIndex("club_request_unique_pending_idx")
    .on(t.userId, t.clubId, t.requestedTeamId)
    .where(sql`${t.status} = 'pending'`),
  clubStatusIdx: index("club_request_club_status_idx").on(t.clubId, t.status)
}));
```

The partial unique index ensures one *open* request per user/club/team combination; once resolved (approved/rejected) the user can request again.

### 6.4 Admin inbox under `/verein/{slug}/einstellungen/mitglieder`

Sections (top to bottom):

1. **Offene Anfragen** (only if pending requests exist): table of pending requests, each row showing requester email, requested role, requested team name (or "Ganzer Verein"), message preview, [Annehmen] / [Ablehnen] buttons.
2. **Aktive Mitglieder**: list of club + team memberships. Admin can change role or revoke.
3. **Einladen**: form to directly invite a user by email (creates a magic-link with a special `roleInvite` token — out of scope, future iteration).

Approve action:

- For club-wide request: insert `clubMemberships(userId, clubId, role)`.
- For team-scoped request: insert `teamMemberships(userId, teamId, role)` (use the team-role enum, mapped from requested role: requested admin→trainer at team level, otherwise direct).
- Update request row: `status=approved`, `respondedAt=now`, `respondedByUserId=admin`.
- Send mail to requester with "Du hast jetzt Zugriff" + link.

Reject action: optional reason field, mail with reason, status=rejected.

## 7. Mobile IA: Burger Drawer + Tile Dashboards

### 7.1 Sub-nav split

`components/.../verein-sub-nav.tsx` keeps the horizontal-tabs layout but renders only on `md+` viewports. On mobile (<768px), `verein/{slug}/layout.tsx` renders a top app bar with:

```
🍔  ASC Neuenheim  ▾
```

Tap → `Sheet` (shadcn Sheet from `components/ui/sheet.tsx`, already imported elsewhere) slides in from the left containing:

- User block: avatar + email
- "Aktuelle Rolle" header + active club name + role pill
- 6 nav items (Dashboard / Ereignisse / Sponsoren / Abrechnungen / Abo / Einstellungen) with emoji + label, large touch-targets (min 48px height)
- Divider
- "Rolle wechseln" → opens sub-drawer with other identities + "+ Neue Rolle"
- Divider
- "Abmelden"

### 7.2 Top-level app header on mobile

`AppHeader` (`components/shared/app-header.tsx`) is unchanged on landing/auth pages. On `/verein/*` and `/sponsor/*` pages on mobile, it hides itself (the Sub-Nav app bar takes over). On desktop everywhere, `AppHeader` stays as-is.

### 7.3 Vereins-Dashboard tile reorg

`app/(verein)/verein/[slug]/page.tsx` becomes a tile-grid:

```
[ Diese Woche tile ]                 [ Mannschaften tile ]
[ Aktive Sponsoren tile ]            [ Letzte Charges tile ]
[ Einladungslink teilen tile (CTA, full-width on mobile) ]
```

Mobile: single-column stack, tiles full-width with 16px gaps. Desktop: 2-col grid up to lg, 3-col grid xl+. Each tile is roughly 120-160px tall.

Tile component:

```tsx
// components/shared/dashboard-tile.tsx
interface DashboardTileProps {
  icon: string;                          // emoji or component
  title: string;
  primary: string;                       // big number / value
  secondary?: string;                    // sub-line
  badge?: { label: string; tone: "accent" | "warning" | "muted" };
  href?: string;                         // makes the whole tile clickable
  onClick?: () => void;
  variant?: "default" | "cta";           // cta tiles get accent background
}
```

Tiles for Vereins-Dashboard:

1. **Diese Woche** — sum of charges this week, count of matches, headline win/result. → `/verein/{slug}/abrechnungen?range=week`
2. **Mannschaften** — count of active teams, mini-grid of 2-3 team names with weekly €. → `/verein/{slug}/mannschaften` (NEW route, currently doesn't exist as a standalone page; today's overview-list is on the dashboard)
3. **Aktive Sponsoren** — count + top-3 with monthly total. → `/verein/{slug}/sponsoren`
4. **Letzte Charges** — 3 latest charge rows. → `/verein/{slug}/abrechnungen`
5. **Einladungslink teilen** — CTA tile, full-width on mobile. → opens Sheet with share options (WhatsApp/Mail/Copy)

### 7.4 New route: `/verein/{slug}/mannschaften`

The current Vereins-Dashboard contains a long Mannschaften-list. After the tile-reorg, that list moves to its own page. The dashboard tile only shows summary stats.

### 7.5 Sponsor-Dashboard tile reorg

`app/(sponsor)/sponsor/page.tsx` follows the same tile pattern:

1. **Diesen Monat** — total charged this month, count of triggered events. → `/sponsor/charges` (Phase D creates the route if missing)
2. **Meine Pledges** — count of active pledges, top mannschaft by €. → `/sponsor/pledges`
3. **Geilster Moment** — recent biggest single charge (e.g., "20 € Comeback gegen FC X"). → match detail page
4. **Familie verwalten** — only shown for sponsors of `type=familie`. → settings/family page (existing logic, just relocated as a tile)
5. **Neue Mannschaft entdecken** — CTA tile. → `/sponsor/discover`

Empty states: each tile gracefully degrades. "Noch keine Pledges? Öffne einen Einladungslink oder entdecke eine Mannschaft." No blank tiles.

### 7.6 Floating Action Button (FAB)

Mobile only. On Vereins-pages: FAB bottom-right with `+` icon. Tap → Sheet with three actions:

- "Manuelles Ereignis melden" (only if Club-Admin or Club/Team-Trainer and a match exists)
- "Sponsor einladen" (only if Admin or Trainer of club; for team-trainer scoped to their team)
- "Mannschaft hinzufügen" (only if Club-Admin)

Desktop: these become a horizontal button-row above the tile grid.

## 8. Implementation Phasing

This spec breaks into **four sequential plans**, each with its own writing-plans pass. Phases can be shipped to production independently with feature-flags if needed.

| Phase | Title                                       | Touches                                                                                          | Sequential gate                |
| ----- | ------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| **A** | Identity backbone                           | `team_memberships` table, scope helpers, query helpers, tests                                    | Must come first                |
| **B** | Smart routing + role picker + switcher      | `/dashboard` logic, `/select-role`, header dropdown extension, `/api/user/roles`                 | Depends on A                   |
| **C** | Duplicate-detection + access-request        | `club_membership_requests` table, onboarding step 1 lock state, `/onboarding/zugriff-anfragen`, admin inbox | Depends on A                   |
| **D** | Mobile IA + tile dashboards                 | Mobile Sub-Nav burger, AppHeader hide-on-mobile-app pages, dashboard tile component, Vereins + Sponsor dashboards, `/verein/{slug}/mannschaften`, FAB | Can start parallel with B/C; integration depends on B for role-switcher in drawer |

Estimated commits (rough): A ≈ 3-4, B ≈ 4-5, C ≈ 6-7, D ≈ 8-10.

## 9. Risk & Open Questions

- **Migration safety**: `team_memberships` and `club_membership_requests` are new tables (no data backfill). Zero-risk.
- **Existing Vereins-Dashboard load**: tile reorg deletes a fair amount of code from `app/(verein)/verein/[slug]/page.tsx`. Must verify visual regression on existing club data (Dossenheim, Neuenheim) before merging Phase D.
- **Discoverability of "Rolle wechseln" on mobile**: only via burger drawer or avatar dropdown. Should we add an inline "Rolle wechseln" link in the page footer too? Decision: no — keep entry points limited. Two entry points (avatar + burger) are enough.
- **What if a user is Sponsor *and* Club-Member in the same Verein?** They show up as 2 identities in `/select-role` (one club card, one sponsor card). Switching is via URL. No conflict.
- **Admin self-demotion guard**: removing the *last* admin of a club must be blocked. The Mitglieder UI checks if `clubMemberships(role=admin)` count > 1 before allowing role-down or revoke.
- **Orphaned clubs (admin email dead)**: out-of-scope per §3, handled by support email fallback in §6.2 confirmation screen.

## 10. Success Criteria

After all four phases are live:

1. ✅ User with 0 identities → `/signup` (no `/onboarding/verein/1` accidental redirect).
2. ✅ User with 1 identity → direct to that identity's home.
3. ✅ User with ≥2 identities → `/select-role`.
4. ✅ Picking an already-registered Verein in onboarding shows an "access request" path; the request appears in the admin's Mitglieder inbox; approving creates the membership and emails the requester.
5. ✅ Team-trainer can be created via the access-request flow with `requestedTeamId` set; they can navigate `/verein/{slug}/mannschaft/{teamId}` but not other teams.
6. ✅ Mobile user on `/verein/{slug}` sees a burger drawer that exposes all 6 sub-nav sections; no horizontal scroll.
7. ✅ Vereins-Dashboard on mobile is a vertical stack of ≤6 tiles; tapping each tile navigates to a focused sub-page.
8. ✅ Sponsor-Dashboard on mobile follows the same tile pattern.

## 11. Telemetry / Logging

No new analytics events in Phase 1. Existing `inngest`-logged events (sponsor invites, charges) remain. If we later want to measure "how many users see /select-role" vs "fall through to single-identity redirect", we add it then. YAGNI for now.
