# Phase A: Identity Backbone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the database + access-control foundation that lets a user have a team-specific membership independent of club-level membership, and expose a single query that returns a user's full identity snapshot for later UI work.

**Architecture:** One new Drizzle table (`team_memberships`), one pure resolver + one auth wrapper in `lib/auth/scope.ts`, one new query helper in `lib/db/queries/user-identities.ts`. Tests are DB integration tests using the existing `resetTestDb` helper. No UI work in this phase — everything is consumed by Phases B/C/D later.

**Tech Stack:** Drizzle ORM (Postgres), Vitest, Next.js 15 App Router, `@paralleldrive/cuid2` for IDs, `better-auth` schema (untouched).

**Source spec:** [docs/superpowers/specs/2026-05-22-identity-roles-mobile-ia-design.md](../specs/2026-05-22-identity-roles-mobile-ia-design.md) §4 (Identity & Role Model) + §5.1 (`getUserIdentities` shape).

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Modify | `lib/db/schema/clubs.ts` | Add `teamMemberRoleEnum` + `teamMemberships` table |
| Create | `drizzle/migrations/0007_*.sql` | Auto-generated migration (do NOT hand-edit) |
| Modify | `tests/setup/db.ts` | Add `teamMemberships` to `resetTestDb` wipe order |
| Modify | `lib/auth/scope.ts` | Add `resolveTeamAccess` (pure) + `assertTeamAccess` (wrapper) |
| Create | `lib/db/queries/user-identities.ts` | `getUserIdentities` query helper |
| Create | `tests/lib/scope-team.test.ts` | DB integration tests for `resolveTeamAccess` |
| Create | `tests/lib/user-identities.test.ts` | DB integration tests for `getUserIdentities` |

No changes to `lib/db/schema/index.ts` — it already re-exports everything from `clubs.ts` via `export * from "./clubs"`.

---

## Task 1: Schema + Migration

**Files:**
- Modify: `lib/db/schema/clubs.ts`
- Modify: `tests/setup/db.ts`
- Create: `drizzle/migrations/0007_*.sql` (auto-generated)

- [ ] **Step 1.1: Add `teamMemberRoleEnum` + `teamMemberships` to clubs schema**

Open `lib/db/schema/clubs.ts`. At the top, find the existing `memberRoleEnum` export (line ~9). Right after it, add the team enum:

```ts
export const teamMemberRoleEnum = pgEnum("team_member_role", ["trainer", "viewer"]);
```

At the bottom of the file, after the `players` table definition, append the new table:

```ts
export const teamMemberships = pgTable(
  "team_memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    role: teamMemberRoleEnum("role").notNull().default("trainer"),
    invitedByUserId: text("invited_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.teamId] }),
    teamIdx: index("team_memberships_team_idx").on(t.teamId)
  })
);
```

The imports at the top of the file already include `pgTable`, `text`, `timestamp`, `pgEnum`, `index`, `primaryKey` — no new imports needed.

- [ ] **Step 1.2: Add `teamMemberships` to `resetTestDb`**

Open `tests/setup/db.ts`. In the import list, add `teamMemberships`:

```ts
import {
  users,
  clubs,
  clubMemberships,
  teamMemberships,
  teams,
  sponsors,
  // ...rest unchanged
} from "@/lib/db/schema";
```

Inside `resetTestDb()`, add a delete for `teamMemberships` BEFORE the `clubMemberships` delete (both reference `users` but `teamMemberships` also references `teams`, which is deleted later — order matters less here than for FK constraints, but match the dependency chain):

```ts
  await db.delete(players);
  await db.delete(teamMemberships);   // NEW: must be before teams + users delete
  await db.delete(clubMemberships);
  await db.delete(teams);
```

- [ ] **Step 1.3: Generate the migration**

Run:

```bash
npm run db:generate
```

Expected output: a new file `drizzle/migrations/0007_<adjective>_<noun>.sql` is created. Open it and verify the body contains roughly:

```sql
CREATE TYPE "public"."team_member_role" AS ENUM('trainer', 'viewer');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_memberships" (
  "user_id" text NOT NULL,
  "team_id" text NOT NULL,
  "role" "team_member_role" DEFAULT 'trainer' NOT NULL,
  "invited_by_user_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "team_memberships_user_id_team_id_pk" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
-- (plus similar FK statements for team_id and invited_by_user_id)
-- (plus CREATE INDEX "team_memberships_team_idx" ON "team_memberships" USING btree ("team_id");)
```

If the migration file looks wrong (e.g., drops other tables), STOP and ask. Do NOT hand-edit migration SQL — fix the schema file and re-run `db:generate`.

- [ ] **Step 1.4: Apply the migration**

Run:

```bash
npm run db:migrate
```

Expected output: "Migration … applied" or similar. No errors.

- [ ] **Step 1.5: Verify the table exists**

Run a one-shot SQL check:

```bash
npx dotenv -e .env.local -- npx tsx -e "import { db } from './lib/db/client'; import { sql } from 'drizzle-orm'; (async () => { const r = await db.execute(sql\`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'team_memberships' ORDER BY ordinal_position\`); console.log(r.rows); process.exit(0); })()"
```

Expected output: 5 rows — `user_id`, `team_id`, `role`, `invited_by_user_id`, `created_at`.

- [ ] **Step 1.6: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "scope|schema/clubs|tests/setup" | head -10
```

Expected output: empty (no errors in touched files).

- [ ] **Step 1.7: Commit**

```bash
git add lib/db/schema/clubs.ts tests/setup/db.ts drizzle/migrations/
git commit -m "$(cat <<'EOF'
feat(schema): add team_memberships table for team-scoped access

New M:N table linking users to teams with role (trainer|viewer). Enables team-specific roles independent of club-level membership — the data backbone for Phase A of the identity refactor. Also extends resetTestDb so integration tests can wipe the table.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `resolveTeamAccess` (pure resolver + tests)

**Files:**
- Modify: `lib/auth/scope.ts`
- Create: `tests/lib/scope-team.test.ts`

**Why a pure resolver?** `assertTeamAccess` calls `requireUser()` (reads session cookie) and `redirect()` (Next.js navigation throw) — both hard to test in isolation. We extract the access-decision logic into a pure function `resolveTeamAccess(userId, teamId, minRole)` that returns a discriminated union. The wrapper around it (Task 3) is a one-liner not worth testing.

- [ ] **Step 2.1: Write the failing test file**

Create `tests/lib/scope-team.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships
} from "@/lib/db/schema";
import { resolveTeamAccess } from "@/lib/auth/scope";
import { resetTestDb } from "../setup/db";

interface Fixture {
  userId: string;
  clubId: string;
  teamId: string;
  otherTeamId: string;
}

async function seed(): Promise<Fixture> {
  const userId = createId();
  const clubId = createId();
  const teamId = createId();
  const otherTeamId = createId();

  await db.insert(users).values({
    id: userId,
    email: `test-${userId}@kickpact.local`,
    emailVerified: true,
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await db.insert(clubs).values({
    id: clubId,
    slug: `c-${clubId.slice(0, 8)}`,
    name: "Test Club"
  });
  await db.insert(teams).values([
    { id: teamId, clubId, name: "1. Herren", saison: "2526" },
    { id: otherTeamId, clubId, name: "2. Herren", saison: "2526" }
  ]);
  return { userId, clubId, teamId, otherTeamId };
}

describe("resolveTeamAccess", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("denies when team does not exist", async () => {
    const userId = createId();
    await db.insert(users).values({
      id: userId,
      email: `t-${userId}@kickpact.local`,
      emailVerified: true,
      name: "X",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const r = await resolveTeamAccess(userId, "nonexistent", "viewer");
    expect(r.granted).toBe(false);
  });

  it("denies when user has no membership at all", async () => {
    const { userId, teamId } = await seed();
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("grants club-admin access at scope=club", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });

  it("grants club-trainer access when only viewer is required", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("trainer");
  });

  it("denies club-viewer when trainer is required", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "viewer" });
    const r = await resolveTeamAccess(userId, teamId, "trainer");
    expect(r.granted).toBe(false);
  });

  it("grants team-trainer access at scope=team", async () => {
    const { userId, teamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "trainer" });
    const r = await resolveTeamAccess(userId, teamId, "trainer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("team");
    expect(r.role).toBe("trainer");
  });

  it("denies team-viewer when trainer is required", async () => {
    const { userId, teamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });
    const r = await resolveTeamAccess(userId, teamId, "trainer");
    expect(r.granted).toBe(false);
  });

  it("does not grant access to a different team within the same club via team-membership", async () => {
    const { userId, teamId, otherTeamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "trainer" });
    const r = await resolveTeamAccess(userId, otherTeamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("prefers club-scope over team-scope when both exist", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });
});
```

- [ ] **Step 2.2: Run the test, verify it fails**

Run:

```bash
npx vitest run tests/lib/scope-team.test.ts 2>&1 | tail -30
```

Expected: import error or "resolveTeamAccess is not a function" — fails because the function doesn't exist yet.

- [ ] **Step 2.3: Implement `resolveTeamAccess`**

Open `lib/auth/scope.ts`. Replace the existing imports at the top with:

```ts
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clubMemberships, clubs, teams, teamMemberships } from "@/lib/db/schema";
import { requireUser } from "./session";
import {
  getSubscriptionGate,
  type SubscriptionGate
} from "@/lib/db/queries/subscription-status";
```

(Added `teams` and `teamMemberships` to the schema import.)

After the existing `assertClubWriteAccess` function at the bottom of the file, append:

```ts
type TeamRole = "trainer" | "viewer";
type ClubRole = "admin" | "trainer" | "viewer";

const CLUB_RANK: Record<ClubRole, number> = { viewer: 1, trainer: 2, admin: 3 };
const TEAM_RANK: Record<TeamRole, number> = { viewer: 1, trainer: 2 };

export type TeamAccessResult =
  | { granted: true; scope: "club"; role: ClubRole; teamId: string; clubId: string }
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
    const needClubRank = minRole === "trainer" ? CLUB_RANK.trainer : CLUB_RANK.viewer;
    if (CLUB_RANK[clubMem.role] >= needClubRank) {
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
```

- [ ] **Step 2.4: Run the tests, verify they pass**

Run:

```bash
npx vitest run tests/lib/scope-team.test.ts 2>&1 | tail -20
```

Expected: `9 passed` (or whatever the final test count is) with 0 failures.

- [ ] **Step 2.5: Commit**

```bash
git add lib/auth/scope.ts tests/lib/scope-team.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): resolveTeamAccess pure resolver for team-scoped access

Given (userId, teamId, minRole), returns a discriminated union indicating whether the user has access via club-membership or team-membership. Club-scope wins over team-scope when both exist. Test suite covers nine scenarios from "no membership" to "both memberships present".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `assertTeamAccess` auth wrapper

**Files:**
- Modify: `lib/auth/scope.ts`

The wrapper is a thin auth+redirect layer over `resolveTeamAccess`. It's not unit-tested directly because mocking `requireUser`/`redirect` is more complex than the logic it adds.

- [ ] **Step 3.1: Add the wrapper**

Open `lib/auth/scope.ts`. After the `resolveTeamAccess` function, append:

```ts
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
```

- [ ] **Step 3.2: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "scope\.ts|assertTeamAccess" | head -10
```

Expected: empty.

- [ ] **Step 3.3: Commit**

```bash
git add lib/auth/scope.ts
git commit -m "$(cat <<'EOF'
feat(auth): assertTeamAccess page-guard wrapper

Wraps resolveTeamAccess with requireUser + redirect-on-fail for use inside Server Components. Returns the access context so pages can render role-aware UI.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `getUserIdentities` query + tests

**Files:**
- Create: `lib/db/queries/user-identities.ts`
- Create: `tests/lib/user-identities.test.ts`

**Shape (from spec §5.1):**

```ts
interface UserIdentities {
  clubs: Array<{
    clubId: string;
    slug: string;
    name: string;
    logoUrl: string | null;
    role: "admin" | "trainer" | "viewer";
    teamCount: number;
    sponsorCount: number;
  }>;
  teamOnly: Array<{
    teamId: string;
    teamName: string;
    clubSlug: string;
    clubName: string;
    role: "trainer" | "viewer";
    saison: string;
  }>;
  sponsor: {
    id: string;
    displayName: string;
    activePledgeCount: number;
    thisMonthCents: number;
  } | null;
}
```

- [ ] **Step 4.1: Write the failing test file**

Create `tests/lib/user-identities.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships,
  sponsors,
  pledges
} from "@/lib/db/schema";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { resetTestDb } from "../setup/db";

async function makeUser(suffix: string): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `u-${suffix}-${id}@kickpact.local`,
    emailVerified: true,
    name: `User ${suffix}`,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return id;
}

async function makeClubWithTeam(slugHint: string) {
  const clubId = createId();
  const teamId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `${slugHint}-${clubId.slice(0, 6)}`,
    name: `Club ${slugHint}`,
    logoUrl: null
  });
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "1. Herren",
    saison: "2526"
  });
  return { clubId, teamId };
}

describe("getUserIdentities", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns empty for a user with no memberships", async () => {
    const userId = await makeUser("empty");
    const r = await getUserIdentities(userId);
    expect(r.clubs).toEqual([]);
    expect(r.teamOnly).toEqual([]);
    expect(r.sponsor).toBeNull();
  });

  it("returns one club identity for a club-admin", async () => {
    const userId = await makeUser("admin");
    const { clubId } = await makeClubWithTeam("a");
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toHaveLength(1);
    expect(r.clubs[0].clubId).toBe(clubId);
    expect(r.clubs[0].role).toBe("admin");
    expect(r.clubs[0].teamCount).toBe(1);
    expect(r.teamOnly).toEqual([]);
  });

  it("returns a team-only identity when user has only a team membership", async () => {
    const userId = await makeUser("teamonly");
    const { teamId, clubId } = await makeClubWithTeam("b");
    await db.insert(teamMemberships).values({ userId, teamId, role: "trainer" });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toEqual([]);
    expect(r.teamOnly).toHaveLength(1);
    expect(r.teamOnly[0].teamId).toBe(teamId);
    expect(r.teamOnly[0].role).toBe("trainer");
    expect(r.teamOnly[0].saison).toBe("2526");
    expect(r.sponsor).toBeNull();
    void clubId;
  });

  it("hides team identity when user already has club membership in the same club", async () => {
    const userId = await makeUser("dual");
    const { clubId, teamId } = await makeClubWithTeam("c");
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toHaveLength(1);
    expect(r.teamOnly).toEqual([]);
  });

  it("returns a sponsor identity when sponsors row exists", async () => {
    const userId = await makeUser("sponsor");
    await db.insert(sponsors).values({
      id: createId(),
      userId,
      displayName: "Tante Erna",
      type: "familie"
    });

    const r = await getUserIdentities(userId);
    expect(r.sponsor).not.toBeNull();
    expect(r.sponsor?.displayName).toBe("Tante Erna");
    expect(r.sponsor?.activePledgeCount).toBe(0);
    expect(r.sponsor?.thisMonthCents).toBe(0);
  });

  it("returns all three identity types for a multi-role user", async () => {
    const userId = await makeUser("multi");
    const { clubId } = await makeClubWithTeam("d");
    const { teamId: otherTeamId } = await makeClubWithTeam("e");
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(teamMemberships).values({ userId, teamId: otherTeamId, role: "trainer" });
    await db.insert(sponsors).values({
      id: createId(),
      userId,
      displayName: "Bäckerei Müller",
      type: "business"
    });

    const r = await getUserIdentities(userId);
    expect(r.clubs).toHaveLength(1);
    expect(r.teamOnly).toHaveLength(1);
    expect(r.sponsor).not.toBeNull();
  });
});
```

- [ ] **Step 4.2: Run the test, verify it fails**

Run:

```bash
npx vitest run tests/lib/user-identities.test.ts 2>&1 | tail -20
```

Expected: import error — `getUserIdentities` doesn't exist yet.

- [ ] **Step 4.3: Implement `getUserIdentities`**

Create `lib/db/queries/user-identities.ts`:

```ts
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

  const teamCounts =
    clubIds.length === 0
      ? new Map<string, number>()
      : await db
          .select({
            clubId: teams.clubId,
            count: sql<number>`count(${teams.id})::int`
          })
          .from(teams)
          .where(and(inArray(teams.clubId, clubIds), eq(teams.isActive, true)))
          .groupBy(teams.clubId)
          .then(
            (rows) => new Map(rows.map((r) => [r.clubId, Number(r.count)]))
          );

  const sponsorCountsByClub =
    clubIds.length === 0
      ? new Map<string, number>()
      : await db
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
          );

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
    const [pledgeStats] = await db
      .select({
        activePledgeCount: sql<number>`count(*) filter (where ${pledges.status} = 'active')::int`
      })
      .from(pledges)
      .where(eq(pledges.sponsorId, sponsorRow.id));

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [chargeStats] = await db
      .select({
        thisMonthCents: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int`
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(and(eq(pledges.sponsorId, sponsorRow.id), gte(charges.createdAt, monthStart)));

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
```

- [ ] **Step 4.4: Run the tests, verify they pass**

Run:

```bash
npx vitest run tests/lib/user-identities.test.ts 2>&1 | tail -20
```

Expected: `6 passed` with 0 failures.

If a test fails because of a column name mismatch (e.g., `pledges.sponsorId` doesn't exist, or `charges.createdAt` is named differently), open `lib/db/schema/pledges.ts` and `lib/db/schema/charges.ts` and fix the column reference, then re-run. Do NOT add `as any` casts.

- [ ] **Step 4.5: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "user-identities" | head -10
```

Expected: empty.

- [ ] **Step 4.6: Commit**

```bash
git add lib/db/queries/user-identities.ts tests/lib/user-identities.test.ts
git commit -m "$(cat <<'EOF'
feat(queries): getUserIdentities aggregates club + team + sponsor identities

Returns the user's full identity snapshot — list of club memberships with per-club team and sponsor counts, team-only memberships (filtered to teams whose parent club is not already in the club list), and the sponsor profile with active-pledge count and month-to-date charge total. Consumed by /dashboard smart routing and /select-role in Phase B.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Full check + push

- [ ] **Step 5.1: Full TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -30
```

Expected: clean for all phase-A files. Pre-existing errors in `scripts/check-pledges.ts` are unrelated and may remain.

- [ ] **Step 5.2: Full vitest run**

Run:

```bash
npx vitest run --reporter=dot 2>&1 | tail -10
```

Expected: all phase-A tests pass alongside the existing suite. Total should be previous count + ~15 new tests.

- [ ] **Step 5.3: Push**

Run:

```bash
git push origin main 2>&1 | tail -5
```

Expected: `main -> main` line in output, no errors.

- [ ] **Step 5.4: Verify**

Run:

```bash
git log --oneline -5
```

Expected output should include the four Phase-A commits at the top:

```
<sha> feat(queries): getUserIdentities aggregates club + team + sponsor identities
<sha> feat(auth): assertTeamAccess page-guard wrapper
<sha> feat(auth): resolveTeamAccess pure resolver for team-scoped access
<sha> feat(schema): add team_memberships table for team-scoped access
```

---

## Done Criteria

After all tasks complete:

1. ✅ New table `team_memberships` exists in the DB with the expected 5 columns and FK constraints.
2. ✅ `resetTestDb` wipes the new table — `npx vitest run` passes the full suite without orphaned rows.
3. ✅ `lib/auth/scope.ts` exports `resolveTeamAccess` (pure) and `assertTeamAccess` (auth wrapper), both with TypeScript strict types and no `any`.
4. ✅ `lib/db/queries/user-identities.ts` exports `getUserIdentities` returning the documented `UserIdentities` shape.
5. ✅ Vitest covers nine `resolveTeamAccess` scenarios and six `getUserIdentities` scenarios; all pass.
6. ✅ Four commits land on `origin/main`, no rebase needed.

Phase A is then ready to be consumed by Phase B (smart routing + role picker), Phase C (access requests will reference `clubMembershipRequests` — a separate table coming in Phase C), and Phase D (mobile burger drawer needs `getUserIdentities` for the switcher footer).
