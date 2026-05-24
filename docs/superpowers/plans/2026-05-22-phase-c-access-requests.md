# Phase C: Duplicate-Detection + Access-Request + Admin-Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user tries to onboard a Verein that's already in the DB, give them a clean "Zugriff anfragen"-flow instead of a 500; route the request to the club's admins who approve or reject from a new "Mitglieder"-page under Einstellungen.

**Architecture:** One new Drizzle table (`club_membership_requests`) with a partial-unique-index against duplicate pending requests. One query helper module (`lib/db/queries/membership-requests.ts`) hosts all four CRUD operations. The Verein-search server-action joins fußball.de hits against `clubs.fussballdeVereinId` and marks claimed Vereine. A new onboarding sub-route `/onboarding/zugriff-anfragen` collects the request. The Admin inbox lives at `/verein/{slug}/einstellungen/mitglieder` (the existing Einstellungen tab's sub-nav already matches `startsWith(href + "/")`). Three plain-HTML mail templates wire the Resend notifications.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (Postgres), Resend (mail), shadcn/ui (Form, RadioGroup, Textarea, Card, Table), Vitest, react-hook-form + zod.

**Source spec:** [docs/superpowers/specs/2026-05-22-identity-roles-mobile-ia-design.md](../specs/2026-05-22-identity-roles-mobile-ia-design.md) §6 (Duplicate-Detection & Access Request).

**Phase A/B dependencies (already shipped):**
- `clubs.fussballdeVereinId` unique constraint, `clubMemberships`, `teamMemberships`, `memberRoleEnum`, `teamMemberRoleEnum`
- `assertClubAccess(slug, "admin")` in `lib/auth/scope.ts`
- `requireUser`, `getServerSession` in `lib/auth/session.ts`
- `resend`, `MAIL_FROM` in `lib/mail/client.ts`; existing template pattern in `lib/mail/templates/magic-link.tsx` (plain HTML string, no React-Email)

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Modify | `lib/db/schema/clubs.ts` | Add `clubMembershipRequestStatusEnum` + `clubMembershipRequests` table |
| Create | `drizzle/migrations/0010_*.sql` | Auto-generated |
| Modify | `tests/setup/db.ts` | Wipe new table |
| Create | `lib/db/queries/membership-requests.ts` | `createRequest`, `listPendingRequestsForClub`, `getRequestById`, `approveRequest`, `rejectRequest` |
| Create | `tests/lib/membership-requests.test.ts` | 8 DB integration tests |
| Create | `lib/mail/templates/access-request.tsx` | Admin notification |
| Create | `lib/mail/templates/access-request-approved.tsx` | Requester success |
| Create | `lib/mail/templates/access-request-rejected.tsx` | Requester rejection (with optional reason) |
| Modify | `lib/crawler/fussballde.ts` | Extend `VereinHit` type with `isAlreadyClaimed` + `claimedClubSlug` (default `false`/`null`) |
| Modify | `app/(onboarding)/onboarding/verein/_actions/search.ts` | Join hits against `clubs` to set `isAlreadyClaimed` |
| Modify | `app/(onboarding)/onboarding/verein/_components/search-step.tsx` | Render lock-badge + "Zugriff anfragen →" CTA for claimed Vereine |
| Create | `app/(onboarding)/onboarding/zugriff-anfragen/page.tsx` | Server Component shell |
| Create | `app/(onboarding)/onboarding/zugriff-anfragen/_components/request-form.tsx` | Client form (react-hook-form + zod) |
| Create | `app/(onboarding)/onboarding/zugriff-anfragen/_actions/request.ts` | `requestClubAccessAction` server action |
| Create | `app/(verein)/verein/[slug]/einstellungen/mitglieder/page.tsx` | Admin inbox |
| Create | `app/(verein)/verein/[slug]/einstellungen/mitglieder/_components/requests-table.tsx` | Client interactive table with approve/reject buttons |
| Create | `app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts` | `approveRequestAction`, `rejectRequestAction` server actions |

The existing `VereinSubNav` already matches `/einstellungen/*` via `pathname.startsWith(fullHref + "/")` — no nav change needed.

---

## Task 1: Schema + Migration

**Files:**
- Modify: `lib/db/schema/clubs.ts`
- Modify: `tests/setup/db.ts`
- Create: `drizzle/migrations/0010_*.sql` (auto-generated)

- [ ] **Step 1.1: Add the enum + table to `clubs.ts`**

Open `lib/db/schema/clubs.ts`. Right after the existing `teamMemberRoleEnum` declaration near the top, add:

```ts
export const clubMembershipRequestStatusEnum = pgEnum(
  "club_membership_request_status",
  ["pending", "approved", "rejected"]
);
```

At the bottom of the file (after `teamMemberships`), append:

```ts
export const clubMembershipRequests = pgTable(
  "club_membership_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    requestedRole: memberRoleEnum("requested_role").notNull(),
    requestedTeamId: text("requested_team_id").references(() => teams.id, { onDelete: "cascade" }),
    message: text("message"),
    status: clubMembershipRequestStatusEnum("status").notNull().default("pending"),
    responseMessage: text("response_message"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedByUserId: text("responded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    // Partial unique index: only one OPEN (pending) request per user/club/team
    // combination. Once resolved (approved/rejected) the user can request again.
    uniquePending: uniqueIndex("club_request_unique_pending_idx")
      .on(t.userId, t.clubId, t.requestedTeamId)
      .where(sql`${t.status} = 'pending'`),
    // Admin-inbox query: list pending requests for a given club.
    clubStatusIdx: index("club_request_club_status_idx").on(t.clubId, t.status)
  })
);
```

Imports `pgEnum`, `pgTable`, `text`, `timestamp`, `uniqueIndex`, `index`, `sql` should all be present at the top of the file already. If `sql` is not imported, add `import { sql } from "drizzle-orm";` (check the existing imports first).

- [ ] **Step 1.2: Update `resetTestDb`**

Open `tests/setup/db.ts`. Add `clubMembershipRequests` to the import list:

```ts
import {
  users,
  clubs,
  clubMemberships,
  clubMembershipRequests,
  teamMemberships,
  teams,
  sponsors,
  // ...rest unchanged
} from "@/lib/db/schema";
```

Add a delete BEFORE the existing `clubMemberships` delete:

```ts
  await db.delete(teamMemberships);
  await db.delete(clubMembershipRequests);    // NEW: must be before clubs + teams + users delete
  await db.delete(clubMemberships);
  await db.delete(teams);
```

- [ ] **Step 1.3: Generate migration**

Run:

```bash
npm run db:generate
```

Expected: new file `drizzle/migrations/0010_<adjective>_<noun>.sql` containing:
- `CREATE TYPE "public"."club_membership_request_status" AS ENUM('pending', 'approved', 'rejected');`
- `CREATE TABLE IF NOT EXISTS "club_membership_requests" (...)` with all 10 columns
- 4 FK ALTER TABLEs (user_id cascade, club_id cascade, requested_team_id cascade, responded_by_user_id set null)
- `CREATE UNIQUE INDEX "club_request_unique_pending_idx" ON "club_membership_requests" USING btree ("user_id","club_id","requested_team_id") WHERE "club_membership_requests"."status" = 'pending';`
- `CREATE INDEX "club_request_club_status_idx" ON "club_membership_requests" USING btree ("club_id","status");`

If the SQL touches unrelated tables (DROP, ALTER on other tables) STOP and report BLOCKED.

- [ ] **Step 1.4: Apply migration**

Run:

```bash
npm run db:migrate
```

Expected: no errors.

- [ ] **Step 1.5: Verify table exists**

Run:

```bash
npx dotenv -e .env.local -- npx tsx -e "import { db } from './lib/db/client'; import { sql } from 'drizzle-orm'; (async () => { const r = await db.execute(sql\`SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'club_membership_requests' ORDER BY ordinal_position\`); console.log(r.rows); process.exit(0); })()"
```

Expected: 10 rows (id, user_id, club_id, requested_role, requested_team_id, message, status, response_message, responded_at, responded_by_user_id, created_at). `message`, `requested_team_id`, `response_message`, `responded_at`, `responded_by_user_id` are `is_nullable: YES`; the rest NO.

- [ ] **Step 1.6: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "schema/clubs|tests/setup" | head -5
```

Expected: empty.

- [ ] **Step 1.7: Commit (no push)**

```bash
git add lib/db/schema/clubs.ts tests/setup/db.ts drizzle/migrations/
git commit -m "$(cat <<'EOF'
feat(schema): add club_membership_requests table for access-request flow

New table tracks pending/approved/rejected requests when a user wants access to a Verein already claimed by someone else. Partial unique index prevents duplicate open requests per (user, club, team). Composite index on (clubId, status) for the admin inbox query. Backbone for Phase C of the identity refactor.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Query layer + tests

**Files:**
- Create: `lib/db/queries/membership-requests.ts`
- Create: `tests/lib/membership-requests.test.ts`

TDD: tests first.

- [ ] **Step 2.1: Write the failing test file**

Create `tests/lib/membership-requests.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships,
  clubMembershipRequests
} from "@/lib/db/schema";
import {
  createRequest,
  listPendingRequestsForClub,
  getRequestById,
  approveRequest,
  rejectRequest
} from "@/lib/db/queries/membership-requests";
import { resetTestDb } from "../setup/db";

async function seedUser(suffix: string): Promise<string> {
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

async function seedClubWithTeam(hint: string) {
  const clubId = createId();
  const teamId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `${hint}-${clubId.slice(0, 6)}`,
    name: `Club ${hint}`
  });
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "1. Herren",
    saison: "2526"
  });
  return { clubId, teamId };
}

describe("membership-requests queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("createRequest inserts a pending club-wide request", async () => {
    const userId = await seedUser("req");
    const { clubId } = await seedClubWithTeam("a");

    const req = await createRequest({
      userId,
      clubId,
      requestedRole: "trainer",
      requestedTeamId: null,
      message: "Bin der neue Co-Trainer"
    });

    expect(req.status).toBe("pending");
    expect(req.requestedRole).toBe("trainer");
    expect(req.requestedTeamId).toBeNull();
    expect(req.message).toBe("Bin der neue Co-Trainer");
  });

  it("createRequest inserts a team-scoped request", async () => {
    const userId = await seedUser("req");
    const { clubId, teamId } = await seedClubWithTeam("b");

    const req = await createRequest({
      userId,
      clubId,
      requestedRole: "trainer",
      requestedTeamId: teamId,
      message: null
    });

    expect(req.requestedTeamId).toBe(teamId);
  });

  it("createRequest throws on duplicate pending request for the same scope", async () => {
    const userId = await seedUser("dup");
    const { clubId } = await seedClubWithTeam("c");

    await createRequest({
      userId, clubId, requestedRole: "trainer", requestedTeamId: null, message: null
    });
    await expect(
      createRequest({
        userId, clubId, requestedRole: "viewer", requestedTeamId: null, message: null
      })
    ).rejects.toThrow();
  });

  it("listPendingRequestsForClub returns only pending requests with requester email", async () => {
    const userA = await seedUser("a");
    const userB = await seedUser("b");
    const { clubId } = await seedClubWithTeam("list");

    await createRequest({ userId: userA, clubId, requestedRole: "trainer", requestedTeamId: null, message: "A" });
    const reqB = await createRequest({ userId: userB, clubId, requestedRole: "viewer", requestedTeamId: null, message: "B" });

    // Resolve B so only A is pending
    await rejectRequest({ requestId: reqB.id, respondedByUserId: userA, reason: "nope" });

    const rows = await listPendingRequestsForClub(clubId);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe("A");
    expect(rows[0].requesterEmail).toMatch(/u-a-/);
    expect(rows[0].requestedTeamName).toBeNull();
  });

  it("listPendingRequestsForClub includes requestedTeamName when team-scoped", async () => {
    const userId = await seedUser("teamreq");
    const { clubId, teamId } = await seedClubWithTeam("teamlist");

    await createRequest({ userId, clubId, requestedRole: "trainer", requestedTeamId: teamId, message: null });

    const rows = await listPendingRequestsForClub(clubId);
    expect(rows).toHaveLength(1);
    expect(rows[0].requestedTeamName).toBe("1. Herren");
  });

  it("approveRequest (club-wide) inserts clubMembership row + marks request approved", async () => {
    const requesterId = await seedUser("rq");
    const adminId = await seedUser("admin");
    const { clubId } = await seedClubWithTeam("appr");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "trainer", requestedTeamId: null, message: null
    });

    await approveRequest({ requestId: req.id, respondedByUserId: adminId });

    const [mem] = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, requesterId));
    expect(mem).toBeDefined();
    expect(mem.role).toBe("trainer");

    const updated = await getRequestById(req.id);
    expect(updated?.status).toBe("approved");
    expect(updated?.respondedByUserId).toBe(adminId);
  });

  it("approveRequest (team-scoped, role=trainer) inserts teamMembership row", async () => {
    const requesterId = await seedUser("rqt");
    const adminId = await seedUser("admt");
    const { clubId, teamId } = await seedClubWithTeam("apprteam");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "trainer", requestedTeamId: teamId, message: null
    });

    await approveRequest({ requestId: req.id, respondedByUserId: adminId });

    const [tmem] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, requesterId));
    expect(tmem).toBeDefined();
    expect(tmem.teamId).toBe(teamId);
    expect(tmem.role).toBe("trainer");

    // No club-wide membership created
    const clubMems = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, requesterId));
    expect(clubMems).toHaveLength(0);
  });

  it("approveRequest (team-scoped, role=admin) downgrades to team-trainer at team level", async () => {
    const requesterId = await seedUser("rqta");
    const adminId = await seedUser("admta");
    const { clubId, teamId } = await seedClubWithTeam("apprteamadm");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "admin", requestedTeamId: teamId, message: null
    });

    await approveRequest({ requestId: req.id, respondedByUserId: adminId });

    const [tmem] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, requesterId));
    expect(tmem.role).toBe("trainer"); // admin doesn't exist at team level; maps to trainer
  });

  it("rejectRequest marks request rejected and stores reason; no membership row created", async () => {
    const requesterId = await seedUser("rj");
    const adminId = await seedUser("rja");
    const { clubId } = await seedClubWithTeam("rej");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "trainer", requestedTeamId: null, message: null
    });

    await rejectRequest({ requestId: req.id, respondedByUserId: adminId, reason: "Brauchen wir nicht" });

    const updated = await getRequestById(req.id);
    expect(updated?.status).toBe("rejected");
    expect(updated?.responseMessage).toBe("Brauchen wir nicht");

    const clubMems = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, requesterId));
    expect(clubMems).toHaveLength(0);
  });
});
```

- [ ] **Step 2.2: Run tests, verify failure**

Run:

```bash
npx vitest run tests/lib/membership-requests.test.ts 2>&1 | tail -25
```

Expected: import error — module doesn't exist.

- [ ] **Step 2.3: Implement `lib/db/queries/membership-requests.ts`**

Create the file:

```ts
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubMembershipRequests,
  clubMemberships,
  teamMemberships,
  teams,
  users
} from "@/lib/db/schema";

export type MembershipRequestStatus = "pending" | "approved" | "rejected";
export type RequestedRole = "admin" | "trainer" | "viewer";

export interface CreateRequestArgs {
  userId: string;
  clubId: string;
  requestedRole: RequestedRole;
  requestedTeamId: string | null;
  message: string | null;
}

export interface MembershipRequest {
  id: string;
  userId: string;
  clubId: string;
  requestedRole: RequestedRole;
  requestedTeamId: string | null;
  message: string | null;
  status: MembershipRequestStatus;
  responseMessage: string | null;
  respondedAt: Date | null;
  respondedByUserId: string | null;
  createdAt: Date;
}

/**
 * Inserts a new pending club-membership request. The partial unique index
 * on (userId, clubId, requestedTeamId WHERE status='pending') makes a
 * second-open request throw a UNIQUE-violation — propagate it.
 */
export async function createRequest(args: CreateRequestArgs): Promise<MembershipRequest> {
  const [row] = await db
    .insert(clubMembershipRequests)
    .values({
      userId: args.userId,
      clubId: args.clubId,
      requestedRole: args.requestedRole,
      requestedTeamId: args.requestedTeamId,
      message: args.message
    })
    .returning();
  return row as MembershipRequest;
}

export interface PendingRequestRow extends MembershipRequest {
  requesterEmail: string;
  requestedTeamName: string | null;
}

/**
 * Lists all pending requests for a single club, newest first.
 * Joins requester email and team name for direct display in the admin inbox.
 */
export async function listPendingRequestsForClub(clubId: string): Promise<PendingRequestRow[]> {
  const rows = await db
    .select({
      id: clubMembershipRequests.id,
      userId: clubMembershipRequests.userId,
      clubId: clubMembershipRequests.clubId,
      requestedRole: clubMembershipRequests.requestedRole,
      requestedTeamId: clubMembershipRequests.requestedTeamId,
      message: clubMembershipRequests.message,
      status: clubMembershipRequests.status,
      responseMessage: clubMembershipRequests.responseMessage,
      respondedAt: clubMembershipRequests.respondedAt,
      respondedByUserId: clubMembershipRequests.respondedByUserId,
      createdAt: clubMembershipRequests.createdAt,
      requesterEmail: users.email,
      requestedTeamName: teams.name
    })
    .from(clubMembershipRequests)
    .innerJoin(users, eq(clubMembershipRequests.userId, users.id))
    .leftJoin(teams, eq(clubMembershipRequests.requestedTeamId, teams.id))
    .where(
      and(
        eq(clubMembershipRequests.clubId, clubId),
        eq(clubMembershipRequests.status, "pending")
      )
    )
    .orderBy(desc(clubMembershipRequests.createdAt));

  return rows as PendingRequestRow[];
}

export async function getRequestById(requestId: string): Promise<MembershipRequest | null> {
  const [row] = await db
    .select()
    .from(clubMembershipRequests)
    .where(eq(clubMembershipRequests.id, requestId))
    .limit(1);
  return (row as MembershipRequest | undefined) ?? null;
}

export interface ApproveArgs {
  requestId: string;
  respondedByUserId: string;
}

/**
 * Approves a pending request: creates the matching membership row
 * (clubMemberships for scope=club, teamMemberships for scope=team), then
 * marks the request approved. Returns the updated request.
 *
 * Team-scope mapping: requestedRole "admin" maps to team-level "trainer"
 * (admin doesn't exist at team scope). Other roles pass through directly.
 *
 * No-ops cleanly if the membership already exists (e.g. concurrent approves).
 */
export async function approveRequest(args: ApproveArgs): Promise<MembershipRequest> {
  const req = await getRequestById(args.requestId);
  if (!req) throw new Error(`request not found: ${args.requestId}`);
  if (req.status !== "pending") {
    throw new Error(`request not pending (status=${req.status})`);
  }

  if (req.requestedTeamId) {
    // Team-scoped: trainer | viewer (admin downgrades to trainer)
    const teamRole = req.requestedRole === "viewer" ? "viewer" : "trainer";
    await db
      .insert(teamMemberships)
      .values({
        userId: req.userId,
        teamId: req.requestedTeamId,
        role: teamRole,
        invitedByUserId: args.respondedByUserId
      })
      .onConflictDoNothing();
  } else {
    // Club-wide: admin | trainer | viewer pass through
    await db
      .insert(clubMemberships)
      .values({
        userId: req.userId,
        clubId: req.clubId,
        role: req.requestedRole
      })
      .onConflictDoNothing();
  }

  const [updated] = await db
    .update(clubMembershipRequests)
    .set({
      status: "approved",
      respondedAt: new Date(),
      respondedByUserId: args.respondedByUserId
    })
    .where(eq(clubMembershipRequests.id, req.id))
    .returning();

  return updated as MembershipRequest;
}

export interface RejectArgs {
  requestId: string;
  respondedByUserId: string;
  reason?: string;
}

/**
 * Rejects a pending request: only updates status + responseMessage. No
 * membership row is created.
 */
export async function rejectRequest(args: RejectArgs): Promise<MembershipRequest> {
  const req = await getRequestById(args.requestId);
  if (!req) throw new Error(`request not found: ${args.requestId}`);
  if (req.status !== "pending") {
    throw new Error(`request not pending (status=${req.status})`);
  }

  const [updated] = await db
    .update(clubMembershipRequests)
    .set({
      status: "rejected",
      respondedAt: new Date(),
      respondedByUserId: args.respondedByUserId,
      responseMessage: args.reason ?? null
    })
    .where(eq(clubMembershipRequests.id, req.id))
    .returning();

  return updated as MembershipRequest;
}
```

If TypeScript complains about `as MembershipRequest` casts, switch to typed-select like Phase A's `getUserIdentities` does — but Drizzle's `returning()` doesn't always carry full typing, so the cast is acceptable here. No `as any`.

- [ ] **Step 2.4: Run tests, verify pass**

Run:

```bash
npx vitest run tests/lib/membership-requests.test.ts 2>&1 | tail -20
```

Expected: 8 passed.

- [ ] **Step 2.5: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "membership-requests" | head -5
```

Expected: empty.

- [ ] **Step 2.6: Commit**

```bash
git add lib/db/queries/membership-requests.ts tests/lib/membership-requests.test.ts
git commit -m "$(cat <<'EOF'
feat(queries): membership-requests CRUD + 8 DB integration tests

createRequest, listPendingRequestsForClub (with requester email + team name joined for the admin inbox), getRequestById, approveRequest (creates clubMembership or teamMembership depending on scope; admin→trainer at team level), rejectRequest. Partial unique index makes duplicate-pending throw at DB level — surfaced through the test suite.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mail templates

**Files:**
- Create: `lib/mail/templates/access-request.tsx`
- Create: `lib/mail/templates/access-request-approved.tsx`
- Create: `lib/mail/templates/access-request-rejected.tsx`

Plain-HTML pattern, matching `lib/mail/templates/magic-link.tsx`. No React-Email despite the `.tsx` extension (matches existing convention in repo). Functions return `{ subject, html, text }`.

- [ ] **Step 3.1: Create `access-request.tsx`**

```tsx
export function accessRequestEmail(args: {
  clubName: string;
  requesterEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  requestedTeamName: string | null;
  message: string | null;
  reviewUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, requesterEmail, requestedRole, requestedTeamName, message, reviewUrl } = args;
  const scope = requestedTeamName
    ? `nur für die Mannschaft „${requestedTeamName}"`
    : `für den ganzen Verein`;
  const roleLabel =
    requestedRole === "admin" ? "Admin" : requestedRole === "trainer" ? "Trainer" : "Viewer";

  return {
    subject: `Neue Zugriff-Anfrage für ${clubName}`,
    text: `Hi,\n\n${requesterEmail} möchte ${roleLabel}-Zugriff ${scope} bei ${clubName}.${message ? `\n\nNachricht: "${message}"` : ""}\n\nAnfrage prüfen: ${reviewUrl}\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Neue Zugriff-Anfrage</h1>
      <p style="color: #525252; margin: 0 0 24px;"><strong>${escapeHtml(requesterEmail)}</strong> möchte <strong>${roleLabel}</strong>-Zugriff ${scope} bei <strong>${escapeHtml(clubName)}</strong>.</p>
      ${message ? `<blockquote style="border-left: 3px solid #FF5722; padding: 8px 16px; margin: 16px 0; color: #525252; background: #fafafa;">${escapeHtml(message)}</blockquote>` : ""}
      <a href="${reviewUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Anfrage prüfen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 32px;">Falls der Button nicht funktioniert, öffne diese URL: <a href="${reviewUrl}" style="color:#a3a3a3;">${reviewUrl}</a></p>
    </td></tr>
  </table>
</body></html>`
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 3.2: Create `access-request-approved.tsx`**

```tsx
export function accessRequestApprovedEmail(args: {
  clubName: string;
  requestedRole: "admin" | "trainer" | "viewer";
  scopeLabel: string;
  homeUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, requestedRole, scopeLabel, homeUrl } = args;
  const roleLabel =
    requestedRole === "admin" ? "Admin" : requestedRole === "trainer" ? "Trainer" : "Viewer";

  return {
    subject: `Du hast jetzt Zugriff auf ${clubName}`,
    text: `Hi,\n\ndeine Anfrage für ${roleLabel}-Zugriff (${scopeLabel}) bei ${clubName} wurde genehmigt.\n\nLog dich ein: ${homeUrl}\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Zugriff genehmigt</h1>
      <p style="color: #525252; margin: 0 0 24px;">Deine Anfrage für <strong>${roleLabel}</strong>-Zugriff (${escapeHtml(scopeLabel)}) bei <strong>${escapeHtml(clubName)}</strong> wurde genehmigt.</p>
      <a href="${homeUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Zum Dashboard</a>
    </td></tr>
  </table>
</body></html>`
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 3.3: Create `access-request-rejected.tsx`**

```tsx
export function accessRequestRejectedEmail(args: {
  clubName: string;
  reason: string | null;
}): { subject: string; html: string; text: string } {
  const { clubName, reason } = args;

  return {
    subject: `Anfrage für ${clubName} abgelehnt`,
    text: `Hi,\n\ndeine Zugriff-Anfrage für ${clubName} wurde abgelehnt.${reason ? `\n\nBegründung: "${reason}"` : ""}\n\nDu kannst eine neue Anfrage stellen oder dich direkt an den Vereins-Admin wenden.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Anfrage abgelehnt</h1>
      <p style="color: #525252; margin: 0 0 24px;">Deine Zugriff-Anfrage für <strong>${escapeHtml(clubName)}</strong> wurde abgelehnt.</p>
      ${reason ? `<blockquote style="border-left: 3px solid #a3a3a3; padding: 8px 16px; margin: 16px 0; color: #525252; background: #fafafa;">${escapeHtml(reason)}</blockquote>` : ""}
      <p style="color: #525252; font-size: 14px;">Du kannst eine neue Anfrage stellen oder dich direkt an den Vereins-Admin wenden.</p>
    </td></tr>
  </table>
</body></html>`
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

- [ ] **Step 3.4: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "mail/templates/access" | head -5
```

Expected: empty.

- [ ] **Step 3.5: Commit**

```bash
git add lib/mail/templates/access-request.tsx lib/mail/templates/access-request-approved.tsx lib/mail/templates/access-request-rejected.tsx
git commit -m "$(cat <<'EOF'
feat(mail): three templates for the access-request flow

accessRequestEmail (admin notification, with role + scope + optional message + review URL); accessRequestApprovedEmail (requester success, with link to club dashboard); accessRequestRejectedEmail (requester rejection, with optional reason). Plain-HTML pattern matching the existing magic-link template. Local escapeHtml helper in each file (kept private — no shared util module yet).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Duplicate-Detection in Verein search

**Files:**
- Modify: `lib/crawler/fussballde.ts`
- Modify: `app/(onboarding)/onboarding/verein/_actions/search.ts`
- Modify: `app/(onboarding)/onboarding/verein/_components/search-step.tsx`

- [ ] **Step 4.1: Extend `VereinHit` type**

Open `lib/crawler/fussballde.ts`. Find the `VereinHit` interface (around line 101 based on prior reads — the precise location may differ; locate it via `grep -n "interface VereinHit" lib/crawler/fussballde.ts`). Add two optional fields:

```ts
export interface VereinHit {
  name: string;
  ort: string | null;
  slug: string;
  vereinId: string;
  url: string;
  isAlreadyClaimed?: boolean;    // NEW: set by server action when joined against DB
  claimedClubSlug?: string | null;  // NEW: KickPact slug of the existing club
}
```

The scraper itself does NOT set these — they're populated later by the server action. Optional fields keep `searchVereine` (the Playwright scraper) unchanged.

- [ ] **Step 4.2: Join hits against DB in `searchVereineAction`**

Open `app/(onboarding)/onboarding/verein/_actions/search.ts`. Currently it returns the raw `searchVereine` output. Modify the action to enrich:

```ts
"use server";

import { z } from "zod";
import { inArray } from "drizzle-orm";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";

const searchSchema = z.object({
  query: z.string().min(2).max(80)
});

export async function searchVereineAction(input: { query: string }) {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Bitte mindestens 2 Zeichen eingeben" };
  }
  try {
    const hits = await searchVereine(parsed.data.query);
    const limited = hits.slice(0, 15);

    // Mark hits whose fußball.de-Verein-ID already exists in our DB.
    const fussballdeIds = limited.map((h) => h.vereinId);
    const claimed =
      fussballdeIds.length === 0
        ? []
        : await db
            .select({ slug: clubs.slug, fussballdeVereinId: clubs.fussballdeVereinId })
            .from(clubs)
            .where(inArray(clubs.fussballdeVereinId, fussballdeIds));
    const claimedMap = new Map(
      claimed
        .filter((c): c is { slug: string; fussballdeVereinId: string } => c.fussballdeVereinId !== null)
        .map((c) => [c.fussballdeVereinId, c.slug])
    );

    const enriched = limited.map((h) => ({
      ...h,
      isAlreadyClaimed: claimedMap.has(h.vereinId),
      claimedClubSlug: claimedMap.get(h.vereinId) ?? null
    }));

    return { ok: true as const, results: enriched };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Suche fehlgeschlagen"
    };
  }
}

// getMannschaftenAction stays unchanged — keep it as-is.
```

Important: the existing `getMannschaftenAction` in this file must remain. Only modify `searchVereineAction`.

- [ ] **Step 4.3: Update `search-step.tsx` UI**

Open `app/(onboarding)/onboarding/verein/_components/search-step.tsx`. Update the `VereinHit` local type and the result-list rendering:

```tsx
// Near the top, expand the local type definition (currently around line 11):
type VereinHit = {
  name: string;
  ort: string | null;
  slug: string;
  vereinId: string;
  url: string;
  isAlreadyClaimed?: boolean;
  claimedClubSlug?: string | null;
};
```

Replace the result-list `map` block (the `<ul className="divide-y...">` part) with branched rendering. The current button-per-hit becomes either the existing "select & continue" button OR a "Zugriff anfragen" link for claimed Vereine:

```tsx
              {results.map((v) => {
                const claimed = v.isAlreadyClaimed === true;
                if (claimed) {
                  return (
                    <li key={v.vereinId}>
                      <Link
                        href={`/onboarding/zugriff-anfragen?clubSlug=${encodeURIComponent(v.claimedClubSlug ?? "")}`}
                        className="flex w-full items-center justify-between p-4 text-left hover:bg-amber-50 transition-colors"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-amber-600" aria-hidden>🔒</span>
                            <span className="font-semibold text-brand-night-navy">{v.name}</span>
                            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-amber-800">
                              Schon registriert
                            </span>
                          </div>
                          {v.ort && (
                            <div className="text-xs text-brand-night-navy/40 mt-0.5 ml-6">{v.ort}</div>
                          )}
                        </div>
                        <span className="text-amber-700 text-sm font-semibold">Zugriff anfragen →</span>
                      </Link>
                    </li>
                  );
                }
                return (
                  <li key={v.vereinId}>
                    <button
                      type="button"
                      onClick={() => selectVerein(v)}
                      className="flex w-full items-center justify-between p-4 text-left hover:bg-accent/5 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-brand-night-navy">{v.name}</div>
                        {v.ort && (
                          <div className="text-xs text-brand-night-navy/40 mt-0.5">{v.ort}</div>
                        )}
                      </div>
                      <span className="text-accent text-xl">→</span>
                    </button>
                  </li>
                );
              })}
```

`Link` is already imported from `next/link` in this file (used elsewhere). If not, add `import Link from "next/link";` at the top.

- [ ] **Step 4.4: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "search-step|verein/_actions/search|fussballde\.ts" | head -10
```

Expected: empty.

- [ ] **Step 4.5: Commit**

```bash
git add lib/crawler/fussballde.ts app/\(onboarding\)/onboarding/verein/_actions/search.ts app/\(onboarding\)/onboarding/verein/_components/search-step.tsx
git commit -m "$(cat <<'EOF'
feat(onboarding): mark already-claimed Vereine in search results

searchVereineAction now joins fußball.de hits against clubs.fussballdeVereinId and sets isAlreadyClaimed + claimedClubSlug. The UI renders a lock-icon + "Schon registriert"-badge + "Zugriff anfragen →" CTA for claimed Vereine, linking to the new /onboarding/zugriff-anfragen page. Fresh Vereine still get the existing direct-select button.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `/onboarding/zugriff-anfragen` page

**Files:**
- Create: `app/(onboarding)/onboarding/zugriff-anfragen/page.tsx`
- Create: `app/(onboarding)/onboarding/zugriff-anfragen/_components/request-form.tsx`
- Create: `app/(onboarding)/onboarding/zugriff-anfragen/_actions/request.ts`

- [ ] **Step 5.1: Create the server action**

Create `app/(onboarding)/onboarding/zugriff-anfragen/_actions/request.ts`:

```ts
"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clubs, clubMemberships, teams, users } from "@/lib/db/schema";
import { createRequest } from "@/lib/db/queries/membership-requests";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { accessRequestEmail } from "@/lib/mail/templates/access-request";

const inputSchema = z.object({
  clubSlug: z.string().min(1),
  requestedRole: z.enum(["admin", "trainer", "viewer"]),
  requestedTeamId: z.string().nullable(),
  message: z.string().max(280).nullable()
});

export type RequestClubAccessInput = z.infer<typeof inputSchema>;

export async function requestClubAccessAction(input: RequestClubAccessInput) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Ungültige Eingabe" };
  }
  const user = await requireUser();

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.slug, parsed.data.clubSlug))
    .limit(1);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  // If the user already has any club membership, redirect them to the club
  // instead of creating a duplicate request.
  const [existing] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, club.id)))
    .limit(1);
  if (existing) {
    return { ok: true as const, alreadyMember: true, clubSlug: club.slug };
  }

  let req;
  try {
    req = await createRequest({
      userId: user.id,
      clubId: club.id,
      requestedRole: parsed.data.requestedRole,
      requestedTeamId: parsed.data.requestedTeamId,
      message: parsed.data.message
    });
  } catch {
    // Likely a duplicate-pending unique violation — surface a friendly message.
    return {
      ok: false as const,
      error: "Du hast für diesen Verein bereits eine offene Anfrage."
    };
  }

  await notifyAdmins({
    clubId: club.id,
    clubSlug: club.slug,
    clubName: club.name,
    requesterEmail: user.email,
    requestedRole: parsed.data.requestedRole,
    requestedTeamId: parsed.data.requestedTeamId,
    message: parsed.data.message
  });

  revalidatePath("/onboarding/zugriff-anfragen");
  return { ok: true as const, alreadyMember: false, requestId: req.id };
}

async function notifyAdmins(args: {
  clubId: string;
  clubSlug: string;
  clubName: string;
  requesterEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  requestedTeamId: string | null;
  message: string | null;
}): Promise<void> {
  // Fetch admin emails via clubMemberships → users join
  const adminRows = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(and(eq(clubMemberships.clubId, args.clubId), eq(clubMemberships.role, "admin")));

  let teamName: string | null = null;
  if (args.requestedTeamId) {
    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, args.requestedTeamId))
      .limit(1);
    teamName = team?.name ?? null;
  }

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const reviewUrl = `${base}/verein/${args.clubSlug}/einstellungen/mitglieder`;

  const mail = accessRequestEmail({
    clubName: args.clubName,
    requesterEmail: args.requesterEmail,
    requestedRole: args.requestedRole,
    requestedTeamName: teamName,
    message: args.message,
    reviewUrl
  });

  await Promise.all(
    adminRows.map((a) =>
      resend.emails.send({
        from: MAIL_FROM,
        to: a.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      })
    )
  );
}
```

- [ ] **Step 5.2: Create the form component**

Create `app/(onboarding)/onboarding/zugriff-anfragen/_components/request-form.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { requestClubAccessAction } from "../_actions/request";

const schema = z.object({
  requestedRole: z.enum(["admin", "trainer", "viewer"]),
  scope: z.enum(["club", "team"]),
  requestedTeamId: z.string().nullable(),
  message: z.string().max(280).optional()
});
type FormValues = z.infer<typeof schema>;

export function RequestForm({
  clubSlug,
  clubName,
  teams
}: {
  clubSlug: string;
  clubName: string;
  teams: Array<{ id: string; name: string; saison: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      requestedRole: "trainer",
      scope: "club",
      requestedTeamId: null,
      message: ""
    }
  });
  const scope = form.watch("scope");

  async function onSubmit(values: FormValues) {
    setPending(true);
    const res = await requestClubAccessAction({
      clubSlug,
      requestedRole: values.requestedRole,
      requestedTeamId: values.scope === "team" ? values.requestedTeamId : null,
      message: values.message?.trim() ? values.message.trim() : null
    });
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.alreadyMember) {
      toast.info("Du hast schon Zugriff — leite weiter.");
      router.push(`/verein/${res.clubSlug}`);
      return;
    }
    router.push(`/onboarding/zugriff-anfragen/gesendet?clubName=${encodeURIComponent(clubName)}`);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="requestedRole"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Welche Rolle?</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2">
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="admin" id="r-admin" />
                        <div>
                          <div className="font-semibold text-sm">Admin</div>
                          <div className="text-xs text-brand-night-navy/60">Vollzugriff inkl. Abo + Einstellungen</div>
                        </div>
                      </Label>
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="trainer" id="r-trainer" />
                        <div>
                          <div className="font-semibold text-sm">Trainer</div>
                          <div className="text-xs text-brand-night-navy/60">Mannschaften + Events + Sponsoren</div>
                        </div>
                      </Label>
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="viewer" id="r-viewer" />
                        <div>
                          <div className="font-semibold text-sm">Viewer</div>
                          <div className="text-xs text-brand-night-navy/60">Nur Lesen</div>
                        </div>
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Umfang</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2">
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="club" id="s-club" />
                        <div className="font-semibold text-sm">Ganzer Verein</div>
                      </Label>
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="team" id="s-team" />
                        <div className="font-semibold text-sm">Nur eine Mannschaft</div>
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scope === "team" && (
              <FormField
                control={form.control}
                name="requestedTeamId"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>Welche Mannschaft?</FormLabel>
                    <FormControl>
                      <select
                        className="w-full rounded-md border border-brand-neutral/40 bg-white px-3 py-2 text-sm"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      >
                        <option value="">— wählen —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · Saison {t.saison}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Nachricht an die Admins (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="z.B. „Bin der neue Co-Trainer der C-Jugend ab nächster Saison"."
                      maxLength={280}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-brand-night-navy/40">Max. 280 Zeichen</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" variant="accent" disabled={pending} className="w-full">
              {pending ? "Sende Anfrage…" : "Anfrage senden"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5.3: Create the page**

Create `app/(onboarding)/onboarding/zugriff-anfragen/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { RequestForm } from "./_components/request-form";

export const metadata = { title: "Zugriff anfragen · KickPact" };

export default async function ZugriffAnfragenPage({
  searchParams
}: {
  searchParams: Promise<{ clubSlug?: string }>;
}) {
  const { clubSlug } = await searchParams;
  if (!clubSlug) redirect("/onboarding/verein/1");

  await requireUser();

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);
  if (!club) redirect("/onboarding/verein/1");

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, saison: teams.saison })
    .from(teams)
    .where(eq(teams.clubId, club.id));

  return (
    <main className="mx-auto max-w-2xl px-5 md:px-6 py-10 md:py-16">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Zugriff anfragen
        </div>
        <h1 className="mt-1 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          {club.name}
        </h1>
        <p className="mt-2 text-sm text-brand-night-navy/60">
          Dieser Verein ist schon bei KickPact. Stell eine Anfrage — die Admins entscheiden,
          ob du Zugriff bekommst.
        </p>
      </div>

      <RequestForm clubSlug={club.slug} clubName={club.name} teams={teamRows} />
    </main>
  );
}
```

- [ ] **Step 5.4: Create the success page**

Create `app/(onboarding)/onboarding/zugriff-anfragen/gesendet/page.tsx`:

```tsx
import Link from "next/link";

export const metadata = { title: "Anfrage gesendet · KickPact" };

export default async function GesendetPage({
  searchParams
}: {
  searchParams: Promise<{ clubName?: string }>;
}) {
  const { clubName } = await searchParams;

  return (
    <main className="mx-auto max-w-md px-5 md:px-6 py-16 text-center">
      <div className="text-6xl mb-4">📨</div>
      <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
        Anfrage gesendet
      </h1>
      <p className="mt-3 text-sm text-brand-night-navy/60">
        Wir haben die Admins von {clubName ? <strong>{clubName}</strong> : "dem Verein"} per Mail
        informiert. Sobald sie entscheiden, kriegst du eine Mail — meistens innerhalb von 1–2 Tagen.
      </p>
      <div className="mt-8">
        <Link href="/dashboard" className="text-sm font-semibold text-accent hover:underline">
          ← Zum Dashboard
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 5.5: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "zugriff-anfragen" | head -10
```

Expected: empty.

- [ ] **Step 5.6: Commit**

```bash
git add app/\(onboarding\)/onboarding/zugriff-anfragen/
git commit -m "$(cat <<'EOF'
feat(onboarding): zugriff-anfragen page + request action

New /onboarding/zugriff-anfragen page lets a user request access to a claimed Verein with a chosen role (admin/trainer/viewer) and scope (whole club or single team). Server action persists the request via createRequest, sends mail to all club admins via Resend, returns success state. /gesendet sub-page is the confirmation screen. Already-members get redirected to the club instead of duplicating a request.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin Inbox

**Files:**
- Create: `app/(verein)/verein/[slug]/einstellungen/mitglieder/page.tsx`
- Create: `app/(verein)/verein/[slug]/einstellungen/mitglieder/_components/requests-table.tsx`
- Create: `app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`

- [ ] **Step 6.1: Create the server actions**

Create `app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`:

```ts
"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubs, users } from "@/lib/db/schema";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

const approveSchema = z.object({ requestId: z.string().min(1), clubSlug: z.string().min(1) });
const rejectSchema = z.object({
  requestId: z.string().min(1),
  clubSlug: z.string().min(1),
  reason: z.string().max(280).optional()
});

export async function approveRequestAction(input: { requestId: string; clubSlug: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  await approveRequest({ requestId: req.id, respondedByUserId: admin.id });

  // Notify requester
  const [requester] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, req.userId))
    .limit(1);
  if (requester) {
    const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
    const homeUrl = req.requestedTeamId
      ? `${base}/verein/${club.slug}/mannschaft/${req.requestedTeamId}`
      : `${base}/verein/${club.slug}`;
    const scopeLabel = req.requestedTeamId ? "Mannschafts-Zugriff" : "Vereins-Zugriff";
    const mail = accessRequestApprovedEmail({
      clubName: club.name,
      requestedRole: req.requestedRole,
      scopeLabel,
      homeUrl
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: requester.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}

export async function rejectRequestAction(input: { requestId: string; clubSlug: string; reason?: string }) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  await rejectRequest({
    requestId: req.id,
    respondedByUserId: admin.id,
    reason: parsed.data.reason
  });

  // Notify requester
  const [requester] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, req.userId))
    .limit(1);
  if (requester) {
    const [clubRow] = await db
      .select({ name: clubs.name })
      .from(clubs)
      .where(eq(clubs.id, req.clubId))
      .limit(1);
    const mail = accessRequestRejectedEmail({
      clubName: clubRow?.name ?? club.name,
      reason: parsed.data.reason ?? null
    });
    await resend.emails.send({
      from: MAIL_FROM,
      to: requester.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    });
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}
```

- [ ] **Step 6.2: Create the client table component**

Create `app/(verein)/verein/[slug]/einstellungen/mitglieder/_components/requests-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { approveRequestAction, rejectRequestAction } from "../_actions/approve-reject";

interface PendingRequest {
  id: string;
  requesterEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  requestedTeamName: string | null;
  message: string | null;
  createdAt: Date;
}

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

export function RequestsTable({
  clubSlug,
  requests
}: {
  clubSlug: string;
  requests: PendingRequest[];
}) {
  const [pending, startTransition] = useTransition();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function onApprove(id: string) {
    startTransition(async () => {
      const res = await approveRequestAction({ requestId: id, clubSlug });
      if (!res.ok) toast.error(res.error);
      else toast.success("Zugriff freigegeben");
    });
  }

  function onReject(id: string) {
    startTransition(async () => {
      const res = await rejectRequestAction({
        requestId: id,
        clubSlug,
        reason: reason.trim() || undefined
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Abgelehnt");
        setRejectFor(null);
        setReason("");
      }
    });
  }

  if (requests.length === 0) {
    return (
      <p className="text-sm text-brand-night-navy/60">Keine offenen Anfragen.</p>
    );
  }

  return (
    <ul className="space-y-3">
      {requests.map((r) => (
        <li
          key={r.id}
          className="rounded-xl border border-brand-neutral/40 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-brand-night-navy truncate">
                {r.requesterEmail}
              </div>
              <div className="mt-1 text-xs text-brand-night-navy/60">
                Möchte <strong>{ROLE_LABEL[r.requestedRole]}</strong>-Zugriff{" "}
                {r.requestedTeamName ? (
                  <>für <strong>{r.requestedTeamName}</strong></>
                ) : (
                  <>für den ganzen Verein</>
                )}
              </div>
              {r.message && (
                <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-xs text-brand-night-navy/70 italic">
                  „{r.message}"
                </blockquote>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="accent"
                disabled={pending}
                onClick={() => onApprove(r.id)}
              >
                Annehmen
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setRejectFor(rejectFor === r.id ? null : r.id);
                  setReason("");
                }}
              >
                {rejectFor === r.id ? "Abbrechen" : "Ablehnen"}
              </Button>
            </div>
          </div>
          {rejectFor === r.id && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="Optional: Grund für die Ablehnung (wird dem Anfragenden gemailt)"
                maxLength={280}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={() => onReject(r.id)}
              >
                Ablehnen bestätigen
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6.3: Create the page**

Create `app/(verein)/verein/[slug]/einstellungen/mitglieder/page.tsx`:

```tsx
import Link from "next/link";
import { eq } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubMemberships, teamMemberships, users, teams } from "@/lib/db/schema";
import { listPendingRequestsForClub } from "@/lib/db/queries/membership-requests";
import { RequestsTable } from "./_components/requests-table";

export const metadata = { title: "Mitglieder · KickPact" };

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

export default async function MitgliederPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "admin");

  const [pendingRequests, clubMems, teamMems] = await Promise.all([
    listPendingRequestsForClub(club.id),
    db
      .select({
        userId: clubMemberships.userId,
        email: users.email,
        role: clubMemberships.role,
        createdAt: clubMemberships.createdAt
      })
      .from(clubMemberships)
      .innerJoin(users, eq(clubMemberships.userId, users.id))
      .where(eq(clubMemberships.clubId, club.id)),
    db
      .select({
        userId: teamMemberships.userId,
        email: users.email,
        role: teamMemberships.role,
        teamName: teams.name,
        teamId: teams.id,
        createdAt: teamMemberships.createdAt
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(eq(teams.clubId, club.id))
  ]);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/verein/${slug}/einstellungen`}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← Einstellungen
        </Link>
        <h2 className="mt-1.5 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Mitglieder
        </h2>
        <p className="text-sm text-brand-night-navy/60">
          Wer hat Zugriff auf {club.name} — und wer will Zugriff.
        </p>
      </div>

      {/* Offene Anfragen */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-3">
          Offene Anfragen
          {pendingRequests.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {pendingRequests.length}
            </span>
          )}
        </h3>
        <RequestsTable clubSlug={slug} requests={pendingRequests} />
      </section>

      {/* Aktive Mitglieder */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-3">
          Aktive Mitglieder
        </h3>

        {clubMems.length === 0 && teamMems.length === 0 ? (
          <p className="text-sm text-brand-night-navy/60">Noch keine Mitglieder.</p>
        ) : (
          <ul className="space-y-2">
            {clubMems.map((m) => (
              <li
                key={`c-${m.userId}`}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-brand-night-navy truncate">{m.email}</span>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                  Verein · {ROLE_LABEL[m.role]}
                </span>
              </li>
            ))}
            {teamMems.map((m) => (
              <li
                key={`t-${m.userId}-${m.teamId}`}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-brand-night-navy truncate">{m.email}</span>
                <span className="shrink-0 rounded-full bg-brand-neutral/30 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-brand-night-navy">
                  {m.teamName} · {m.role === "trainer" ? "Trainer" : "Viewer"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {/* TODO (future iteration): role-change + revoke buttons here.
            Admin-self-demotion guard must check clubMemberships(role=admin) count > 1
            before allowing role-down or revoke on self. */}
      </section>
    </div>
  );
}
```

- [ ] **Step 6.4: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "mitglieder" | head -10
```

Expected: empty.

- [ ] **Step 6.5: Commit**

```bash
git add app/\(verein\)/verein/\[slug\]/einstellungen/mitglieder/
git commit -m "$(cat <<'EOF'
feat(admin-inbox): mitglieder page with pending-requests + active-memberships

New page at /verein/{slug}/einstellungen/mitglieder (matches the existing Einstellungen sub-nav via startsWith). admin-only. Shows pending access requests with approve/reject actions (with optional reject reason), plus the active club + team memberships. Approve/reject server actions wire createRequest's results into clubMemberships/teamMemberships and mail the requester via the templates from Task 3.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Full check + push

- [ ] **Step 7.1: Full TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: clean for all Phase C files. Pre-existing errors in `scripts/check-pledges.ts` or other unrelated files may remain — flag but don't fix.

- [ ] **Step 7.2: Full vitest run**

Run:

```bash
npx vitest run --reporter=dot 2>&1 | tail -15
```

Expected: prior count + 8 new tests passing. No regressions to Phase A/B tests. Pre-existing failures in `tests/scraper/engine/triggers-auto.test.ts` and `tests/scraper/integration/*` may persist — those are not Phase C's concern.

- [ ] **Step 7.3: Push**

Run:

```bash
git push origin main 2>&1 | tail -5
```

Expected: `main -> main`.

- [ ] **Step 7.4: Verify sync**

Run:

```bash
git rev-list --left-right --count main...origin/main
```

Expected: `0 0`.

- [ ] **Step 7.5: Phase C commit summary**

Run:

```bash
git log --oneline -8
```

Expected: top ~6 commits are Phase C (schema, query+tests, mail templates, search-update, /onboarding/zugriff-anfragen, /einstellungen/mitglieder) interleaved with any parallel user commits.

---

## Done Criteria

1. ✅ `club_membership_requests` table exists with partial unique index against duplicate-pending.
2. ✅ `lib/db/queries/membership-requests.ts` exports `createRequest`, `listPendingRequestsForClub`, `getRequestById`, `approveRequest`, `rejectRequest` — all 8 tests pass.
3. ✅ Three mail templates render valid HTML + text with no escaping bugs.
4. ✅ Verein search marks claimed Vereine with `isAlreadyClaimed: true` and the UI shows lock-badge + "Zugriff anfragen" CTA.
5. ✅ `/onboarding/zugriff-anfragen?clubSlug=X` collects role + scope + optional message and persists a pending request + mails the admins.
6. ✅ `/verein/{slug}/einstellungen/mitglieder` shows pending requests for admins, lets them approve (creates club/team membership + mails requester) or reject (with optional reason + mails requester).
7. ✅ All 6+ Phase C commits land on `origin/main`.

Phase C unblocks productive multi-user vereine: an existing club is no longer a dead-end for a second user. Phase D (mobile + tile dashboards) is independent.
