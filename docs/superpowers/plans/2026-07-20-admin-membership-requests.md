# Zugriffsanfragen im Admin-Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the platform Operator (`/admin/vereine/[slug]`) view and approve/reject a club's open membership requests directly, bypassing the club-side subscription gate that blocks the club-admin's own `assertClubAccess` path when billing is `paused`/`past_due`.

**Architecture:** Reuse the existing `approveRequest`/`rejectRequest` DB functions and mail templates unchanged — only the auth gate differs (`assertPlatformAdmin()` instead of `assertClubAccess()`). Extract the shared "send requester an outcome email" helper out of the club-side action file into `lib/mail/access-request-mail.ts` so both flows call the exact same code. Extend the two existing admin read queries (`listVereineForAdmin`, `getVereinDetail`) with pending-request data using the same correlated-subquery / existing-query patterns already used in that file. Every operator mutation is logged via the existing `recordOperatorAction()` audit trail.

**Tech Stack:** Next.js 15 Server Actions, Drizzle ORM, Zod, shadcn/ui (`Button`, `Textarea`, `Badge`, `useConfirm` dialog), Vitest + real Postgres test DB (`resetTestDb`).

**Spec:** [docs/superpowers/specs/2026-07-20-admin-membership-requests-design.md](../specs/2026-07-20-admin-membership-requests-design.md)

---

### Task 1: Extract shared requester-mail helper

Both the existing club-side approve/reject flow and the new admin flow need to send the exact same outcome email to the person who requested access. Today that logic is a private function inside the club-side action file. Move it to a shared, non-`"use server"` module so nothing is duplicated.

**Files:**
- Create: `lib/mail/access-request-mail.ts`
- Modify: `app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`

- [ ] **Step 1: Create the shared helper**

Create `lib/mail/access-request-mail.ts`:

```ts
import { getUserEmailById } from "@/lib/db/queries/account";
import { resend, MAIL_FROM } from "@/lib/mail/client";

type MailContent = { subject: string; html: string; text: string };

/**
 * Schickt dem Antragsteller die Entscheidungs-Mail und wirft bei einem
 * Provider-Fehler (`resend` liefert `{ error }` statt zu werfen — sonst still
 * verschluckt). Als `beforeCommit` an `approveRequest`/`rejectRequest`
 * (`lib/db/queries/membership-requests.ts`) übergeben, damit der Status erst
 * nach erfolgreichem Versand kippt. Kein Empfänger → No-op.
 *
 * Gemeinsam genutzt vom Club-seitigen Flow
 * (`app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`)
 * und dem Operator-Flow
 * (`app/admin/(panel)/vereine/_actions/membership-requests.ts`).
 */
export async function sendRequesterMail(
  requesterUserId: string,
  buildMail: () => MailContent
): Promise<void> {
  const requesterEmail = await getUserEmailById(requesterUserId);
  if (!requesterEmail) return;
  const mail = buildMail();
  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: requesterEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  });
  if (error) {
    throw new Error(`access-request mail failed: ${error.message ?? "unknown"}`);
  }
}
```

- [ ] **Step 2: Point the club-side action at the shared helper**

In `app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts`, find the top of the file:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { getUserEmailById } from "@/lib/db/queries/account";
import { getClubById } from "@/lib/db/queries/club-admin";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

type MailContent = { subject: string; html: string; text: string };

/**
 * Schickt dem Antragsteller die Entscheidungs-Mail und wirft bei einem
 * Provider-Fehler (`resend` liefert `{ error }` statt zu werfen — sonst still
 * verschluckt). Als `beforeCommit` an approve/reject übergeben, damit der
 * Status erst nach erfolgreichem Versand kippt. Kein Empfänger → No-op.
 */
async function sendRequesterMail(
  requesterUserId: string,
  buildMail: () => MailContent
): Promise<void> {
  const requesterEmail = await getUserEmailById(requesterUserId);
  if (!requesterEmail) return;
  const mail = buildMail();
  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: requesterEmail,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  });
  if (error) {
    throw new Error(`access-request mail failed: ${error.message ?? "unknown"}`);
  }
}
```

Replace with:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { getClubById } from "@/lib/db/queries/club-admin";
import { sendRequesterMail } from "@/lib/mail/access-request-mail";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";
```

(The rest of the file — `approveRequestAction` and `rejectRequestAction` — is unchanged; they already call `sendRequesterMail(...)`, which now resolves to the imported shared helper instead of the local one.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (confirms no other file still expects `sendRequesterMail` to be a local/private symbol).

- [ ] **Step 4: Run the existing membership-request test suite**

Run: `npx vitest run tests/lib/membership-requests.test.ts`
Expected: all tests still PASS (this refactor doesn't change behavior, only where the function lives).

- [ ] **Step 5: Commit**

```bash
git add lib/mail/access-request-mail.ts "app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts"
git commit -m "$(cat <<'EOF'
refactor(mail): sendRequesterMail-Helper geteilt nutzbar machen

Extrahiert aus der Club-seitigen approve/reject-Action nach
lib/mail/access-request-mail.ts, damit der kommende Operator-Flow im
Admin-Panel exakt denselben Mail-Code nutzt statt ihn zu duplizieren.
Kein Verhaltensunterschied für den bestehenden Club-Flow.
EOF
)"
```

---

### Task 2: `pendingRequestCount` in der Admin-Vereinsliste

**Files:**
- Modify: `lib/db/queries/platform-stats.ts`
- Test: `tests/lib/platform-stats.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/lib/platform-stats.test.ts`, add the import for `createRequest` next to the existing query imports:

```ts
import {
  getPlatformKpis,
  getTopClubsThisMonth,
  listVereineForAdmin,
  listUsersForAdmin,
  getVereinDetail,
  getUserDetail
} from "@/lib/db/queries/platform-stats";
```

Replace with:

```ts
import {
  getPlatformKpis,
  getTopClubsThisMonth,
  listVereineForAdmin,
  listUsersForAdmin,
  getVereinDetail,
  getUserDetail
} from "@/lib/db/queries/platform-stats";
import { createRequest } from "@/lib/db/queries/membership-requests";
```

Then, right after the `it("listVereineForAdmin returns team / member / sponsor counts per club", ...)` test block (ends with the closing `});` around line 347), insert a new test:

```ts
  it("listVereineForAdmin returns pendingRequestCount per club", async () => {
    const requester = await seedUser("pend");
    const clubWithRequest = await seedClub("pending-req");
    await createRequest({
      userId: requester,
      clubId: clubWithRequest,
      requestedRole: "trainer",
      requestedTeamId: null,
      message: null
    });
    await seedClub("no-pending-req");

    const withPending = await listVereineForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { search: "pending-req" }
    });
    expect(withPending.rows.length).toBe(1);
    expect(withPending.rows[0].pendingRequestCount).toBe(1);

    const withoutPending = await listVereineForAdmin({
      pagination: { page: 1, pageSize: 10 },
      filter: { search: "no-pending-req" }
    });
    expect(withoutPending.rows[0].pendingRequestCount).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/platform-stats.test.ts -t "pendingRequestCount"`
Expected: FAIL — `pendingRequestCount` is `undefined` (property doesn't exist on `AdminVereinRow` yet).

- [ ] **Step 3: Add `pendingRequestCount` to the query**

In `lib/db/queries/platform-stats.ts`, find the `AdminVereinRow` interface:

```ts
export interface AdminVereinRow {
  id: string;
  slug: string;
  name: string;
  ort: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  teamCount: number;
  memberCount: number;
  sponsorCount: number;
  topPlan: string | null;
}
```

Replace with:

```ts
export interface AdminVereinRow {
  id: string;
  slug: string;
  name: string;
  ort: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  teamCount: number;
  memberCount: number;
  sponsorCount: number;
  pendingRequestCount: number;
  topPlan: string | null;
}
```

Then find the `baseSelect` object inside `listVereineForAdmin`:

```ts
    sponsorCount: sql<number>`(
      SELECT COUNT(DISTINCT pl.sponsor_id)::int FROM pledges pl
      INNER JOIN teams t ON t.id = pl.team_id
      WHERE t.club_id = "clubs"."id"
    )`.as("sponsor_count"),
    topPlan: sql<string>`(
```

Replace with:

```ts
    sponsorCount: sql<number>`(
      SELECT COUNT(DISTINCT pl.sponsor_id)::int FROM pledges pl
      INNER JOIN teams t ON t.id = pl.team_id
      WHERE t.club_id = "clubs"."id"
    )`.as("sponsor_count"),
    pendingRequestCount: sql<number>`(
      SELECT COUNT(*)::int FROM club_membership_requests r
      WHERE r.club_id = "clubs"."id" AND r.status = 'pending'
    )`.as("pending_request_count"),
    topPlan: sql<string>`(
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/platform-stats.test.ts -t "pendingRequestCount"`
Expected: PASS

- [ ] **Step 5: Run the full platform-stats suite to check for regressions**

Run: `npx vitest run tests/lib/platform-stats.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/db/queries/platform-stats.ts tests/lib/platform-stats.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): pendingRequestCount in listVereineForAdmin

Correlated Subquery gegen club_membership_requests, gleiches Muster wie
teamCount/memberCount/sponsorCount. Grundlage für den Anfragen-Badge in
der Admin-Vereinsliste.
EOF
)"
```

---

### Task 3: `pendingRequests` in `getVereinDetail`

**Files:**
- Modify: `lib/db/queries/platform-stats.ts`
- Test: `tests/lib/platform-stats.test.ts`

- [ ] **Step 1: Write the failing test**

In `tests/lib/platform-stats.test.ts`, find the existing test `it("getVereinDetail returns full club info or null", ...)`. Right after its closing `});`, add a new test:

```ts
  it("getVereinDetail includes pendingRequests for the club", async () => {
    const requester = await seedUser("detail-pend");
    const clubA = await seedClub("detail-pend");

    await createRequest({
      userId: requester,
      clubId: clubA,
      requestedRole: "viewer",
      requestedTeamId: null,
      message: "Bitte um Zugriff"
    });

    const [club] = await db
      .select({ slug: clubs.slug })
      .from(clubs)
      .where((await import("drizzle-orm")).eq(clubs.id, clubA))
      .limit(1);
    const detail = await getVereinDetail(club.slug);

    expect(detail?.pendingRequests.length).toBe(1);
    expect(detail?.pendingRequests[0].requestedRole).toBe("viewer");
    expect(detail?.pendingRequests[0].message).toBe("Bitte um Zugriff");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/platform-stats.test.ts -t "pendingRequests for the club"`
Expected: FAIL — `detail?.pendingRequests` is `undefined`.

- [ ] **Step 3: Add `pendingRequests` to `getVereinDetail`**

In `lib/db/queries/platform-stats.ts`, find the top-of-file imports and add `listPendingRequestsForClub` + its row type:

```ts
import {
  CYCLE_ORDER,
  PLAN_ORDER,
  getMonthlyEquivalent
} from "@/lib/stripe/pricing";
```

Replace with:

```ts
import {
  CYCLE_ORDER,
  PLAN_ORDER,
  getMonthlyEquivalent
} from "@/lib/stripe/pricing";
import {
  listPendingRequestsForClub,
  type PendingRequestRow
} from "@/lib/db/queries/membership-requests";
```

Find the `VereinDetail` interface's `recentCharges` field (the last field before the closing `}`):

```ts
  recentCharges: Array<{
    id: string;
    amountCents: number;
    triggerType: string;
    status: string;
    createdAt: Date;
    sponsorDisplayName: string;
    teamName: string;
  }>;
}
```

Replace with:

```ts
  recentCharges: Array<{
    id: string;
    amountCents: number;
    triggerType: string;
    status: string;
    createdAt: Date;
    sponsorDisplayName: string;
    teamName: string;
  }>;
  pendingRequests: PendingRequestRow[];
}
```

Find the query body inside `getVereinDetail`, right before its `return`:

```ts
    .where(eq(teams.clubId, club.id))
    .orderBy(desc(charges.createdAt))
    .limit(20);

  return {
```

Replace with:

```ts
    .where(eq(teams.clubId, club.id))
    .orderBy(desc(charges.createdAt))
    .limit(20);

  const pendingRequests = await listPendingRequestsForClub(club.id);

  return {
```

Finally, find the end of the `return` object:

```ts
    members,
    teams: teamRows,
    recentCharges
  };
}
```

Replace with:

```ts
    members,
    teams: teamRows,
    recentCharges,
    pendingRequests
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/platform-stats.test.ts -t "pendingRequests for the club"`
Expected: PASS

- [ ] **Step 5: Run the full platform-stats suite**

Run: `npx vitest run tests/lib/platform-stats.test.ts`
Expected: all tests PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/db/queries/platform-stats.ts tests/lib/platform-stats.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): pendingRequests in getVereinDetail

Zieht listPendingRequestsForClub (bereits vorhanden, vom Club-seitigen
Mitglieder-Flow) in die Admin-Detailansicht rein — keine neue Query.
EOF
)"
```

---

### Task 4: Operator-Actions `adminApproveRequestAction` / `adminRejectRequestAction`

**Files:**
- Create: `app/admin/(panel)/vereine/_actions/membership-requests.ts`

No unit test for this file: it's a `"use server"` action gated by `assertPlatformAdmin()`, which calls Next's `redirect()` — the same reason no test file exists today for `app/admin/(panel)/vereine/_actions/club-actions.ts` or `stripe-actions.ts` (verify: `find app/admin -name "*.test.ts"` returns nothing). Behavior is covered by the DB-level tests in Task 2/3 (`approveRequest`/`rejectRequest` themselves already have tests in `tests/lib/membership-requests.test.ts`) plus the manual staging verification at the end of this plan.

- [ ] **Step 1: Create the actions file**

Create `app/admin/(panel)/vereine/_actions/membership-requests.ts`:

```ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import {
  approveRequest,
  rejectRequest,
  getRequestById
} from "@/lib/db/queries/membership-requests";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { getClubBySlug } from "@/lib/db/queries/club-admin";
import { sendRequesterMail } from "@/lib/mail/access-request-mail";
import { accessRequestApprovedEmail } from "@/lib/mail/templates/access-request-approved";
import { accessRequestRejectedEmail } from "@/lib/mail/templates/access-request-rejected";

/**
 * Operator-Pendant zu approveRequestAction/rejectRequestAction
 * (app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/approve-reject.ts).
 *
 * Nutzt bewusst assertPlatformAdmin() statt assertClubAccess() — das umgeht
 * das Subscription-Gate (lib/auth/scope.ts), das einen Club-Admin mit
 * pausiertem/überfälligem Abo blockieren würde. Gleiche Business-Logik
 * (approveRequest/rejectRequest, gleicher Cross-Tenant-Team-Guard, gleiche
 * Antragsteller-Mail) wie der normale Flow — zusätzlich Audit-Log.
 */

const approveSchema = z.object({ requestId: z.string().min(1), clubSlug: z.string().min(1) });
const rejectSchema = z.object({
  requestId: z.string().min(1),
  clubSlug: z.string().min(1),
  reason: z.string().max(280).optional()
});

export async function adminApproveRequestAction(input: { requestId: string; clubSlug: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const club = await getClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }
  // Cross-Tenant-Guard: requestedTeamId ist client-kontrolliert (1:1 aus dem
  // Club-seitigen Flow übernommen) — Team muss zum Verein der Anfrage gehören.
  if (req.requestedTeamId && !(await getTeamInClub(req.requestedTeamId, club.id))) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  try {
    await approveRequest({
      requestId: req.id,
      respondedByUserId: admin.id,
      beforeCommit: () =>
        sendRequesterMail(req.userId, () => {
          const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
          const homeUrl = req.requestedTeamId
            ? `${base}/verein/${club.slug}/mannschaft/${req.requestedTeamId}`
            : `${base}/verein/${club.slug}`;
          const scopeLabel = req.requestedTeamId ? "Mannschafts-Zugriff" : "Vereins-Zugriff";
          return accessRequestApprovedEmail({
            clubName: club.name,
            requestedRole: req.requestedRole,
            scopeLabel,
            homeUrl
          });
        })
    });
  } catch {
    return {
      ok: false as const,
      error: "Benachrichtigung konnte nicht gesendet werden. Bitte erneut versuchen."
    };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.membership_request_approve",
    targetType: "membership",
    targetId: req.id,
    summary: `Zugriffsanfrage angenommen: ${req.requestedRole} für ${club.name} (${req.userId})`
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}

export async function adminRejectRequestAction(input: {
  requestId: string;
  clubSlug: string;
  reason?: string;
}) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const club = await getClubBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  const req = await getRequestById(parsed.data.requestId);
  if (!req || req.clubId !== club.id) {
    return { ok: false as const, error: "Anfrage nicht gefunden" };
  }

  try {
    await rejectRequest({
      requestId: req.id,
      respondedByUserId: admin.id,
      reason: parsed.data.reason,
      beforeCommit: () =>
        sendRequesterMail(req.userId, () =>
          accessRequestRejectedEmail({
            clubName: club.name,
            reason: parsed.data.reason ?? null
          })
        )
    });
  } catch {
    return {
      ok: false as const,
      error: "Benachrichtigung konnte nicht gesendet werden. Bitte erneut versuchen."
    };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "club.membership_request_reject",
    targetType: "membership",
    targetId: req.id,
    summary: `Zugriffsanfrage abgelehnt: ${req.requestedRole} für ${club.name} (${req.userId})`,
    diff: parsed.data.reason ? { reason: parsed.data.reason } : null
  });

  revalidatePath(`/admin/vereine/${club.slug}`);
  revalidatePath("/admin/vereine");
  return { ok: true as const };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. This is the main correctness check for this file (confirms `getRequestById`'s return fields, `getClubBySlug`'s return fields, `recordOperatorAction`'s `targetType: "membership"` enum member, and the mail template signatures all line up).

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(panel)/vereine/_actions/membership-requests.ts"
git commit -m "$(cat <<'EOF'
feat(admin): Operator-Actions für Zugriffsanfragen annehmen/ablehnen

assertPlatformAdmin() statt assertClubAccess() — umgeht bewusst das
Subscription-Gate, damit ein Operator eine Anfrage auch dann bearbeiten
kann, wenn das Abo des Vereins pausiert/überfällig ist. Gleiche
Business-Logik + Mail wie der Club-seitige Flow, zusätzlich Audit-Log
via recordOperatorAction.
EOF
)"
```

---

### Task 5: `AdminRequestsTable`-Komponente + Einbindung auf der Vereins-Detailseite

**Files:**
- Create: `app/admin/(panel)/vereine/[slug]/_components/admin-requests-table.tsx`
- Modify: `app/admin/(panel)/vereine/[slug]/page.tsx`

- [ ] **Step 1: Create the component**

Create `app/admin/(panel)/vereine/[slug]/_components/admin-requests-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  adminApproveRequestAction,
  adminRejectRequestAction
} from "../../_actions/membership-requests";

type ActionResult = { ok: true } | { ok: false; error: string };

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

export function AdminRequestsTable({
  clubSlug,
  requests
}: {
  clubSlug: string;
  requests: PendingRequest[];
}) {
  const [pending, startTransition] = useTransition();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  async function onApprove(r: PendingRequest) {
    const ok = await confirm({
      title: "Zugriffsanfrage annehmen?",
      description: `${r.requesterEmail} bekommt ${ROLE_LABEL[r.requestedRole]}-Zugriff${
        r.requestedTeamName ? ` auf ${r.requestedTeamName}` : " auf den ganzen Verein"
      }. Als Operator-Aktion wird das protokolliert.`,
      confirmLabel: "Annehmen"
    });
    if (!ok) return;
    startTransition(async () => {
      const res: ActionResult = await adminApproveRequestAction({
        requestId: r.id,
        clubSlug
      });
      if (!res.ok) toast.error(res.error);
      else toast.success("Zugriff freigegeben");
    });
  }

  function onReject(id: string) {
    startTransition(async () => {
      const res: ActionResult = await adminRejectRequestAction({
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
    return <p className="text-sm text-brand-night-navy/60">Keine offenen Anfragen.</p>;
  }

  return (
    <>
      {confirmDialog}
      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
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
                  onClick={() => onApprove(r)}
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
    </>
  );
}
```

- [ ] **Step 2: Wire the section into the club detail page**

In `app/admin/(panel)/vereine/[slug]/page.tsx`, find the imports:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getVereinDetail } from "@/lib/db/queries/platform-stats";
import { ClubActions } from "./_components/club-actions";
import { ClubEditForm } from "@/components/admin/club-edit-form";
import { TeamRowActions } from "@/components/admin/team-row-actions";
import { StripeClubActions } from "@/components/admin/stripe-club-actions";
import { isStripeConfigured } from "@/lib/stripe/client";
import { eur } from "@/lib/utils/currency";
```

Replace with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getVereinDetail } from "@/lib/db/queries/platform-stats";
import { ClubActions } from "./_components/club-actions";
import { AdminRequestsTable } from "./_components/admin-requests-table";
import { ClubEditForm } from "@/components/admin/club-edit-form";
import { TeamRowActions } from "@/components/admin/team-row-actions";
import { StripeClubActions } from "@/components/admin/stripe-club-actions";
import { Badge } from "@/components/ui/badge";
import { isStripeConfigured } from "@/lib/stripe/client";
import { eur } from "@/lib/utils/currency";
```

Find the destructuring line:

```tsx
  const { club, subscription, members, teams, recentCharges } = detail;
```

Replace with:

```tsx
  const { club, subscription, members, teams, recentCharges, pendingRequests } = detail;
```

Find the start of the "Members" section:

```tsx
      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Members ({members.length})
        </h3>
```

Replace with (adds a new "Offene Anfragen" section right before it):

```tsx
      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Offene Anfragen
          {pendingRequests.length > 0 && (
            <Badge tone="warning" className="ml-2">{pendingRequests.length}</Badge>
          )}
        </h3>
        <AdminRequestsTable
          clubSlug={club.slug}
          requests={pendingRequests.map((r) => ({
            id: r.id,
            requesterEmail: r.requesterEmail,
            requestedRole: r.requestedRole,
            requestedTeamName: r.requestedTeamName,
            message: r.message,
            createdAt: r.createdAt
          }))}
        />
      </section>

      <section>
        <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy mb-2">
          Members ({members.length})
        </h3>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(panel)/vereine/[slug]/_components/admin-requests-table.tsx" "app/admin/(panel)/vereine/[slug]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): Offene-Anfragen-Sektion auf der Vereins-Detailseite

AdminRequestsTable zeigt listPendingRequestsForClub-Daten mit
Annehmen/Ablehnen (useConfirm-Dialog statt window.confirm, UI-Standard).
EOF
)"
```

---

### Task 6: Badge-Spalte in der Admin-Vereinsliste

**Files:**
- Modify: `app/admin/(panel)/vereine/_components/vereine-table.tsx`

- [ ] **Step 1: Import `Badge`**

Find:

```tsx
"use client";

import { useRouter } from "next/navigation";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import type { AdminVereinRow, AdminVereinSortKey } from "@/lib/db/queries/platform-stats";
```

Replace with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import type { AdminVereinRow, AdminVereinSortKey } from "@/lib/db/queries/platform-stats";
```

- [ ] **Step 2: Add the column**

Find the `status` column definition and the `verified` column right after it:

```tsx
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <StatusPill status={row.subscriptionStatus} />
    },
    {
      key: "verified",
      label: "Verifiziert",
```

Replace with:

```tsx
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <StatusPill status={row.subscriptionStatus} />
    },
    {
      key: "pendingRequestCount",
      label: "Anfragen",
      align: "right",
      render: (row) =>
        row.pendingRequestCount > 0 ? (
          <Badge tone="warning">{row.pendingRequestCount}</Badge>
        ) : (
          <span className="text-brand-night-navy/40">—</span>
        )
    },
    {
      key: "verified",
      label: "Verifiziert",
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/(panel)/vereine/_components/vereine-table.tsx"
git commit -m "$(cat <<'EOF'
feat(admin): Anfragen-Badge in der Vereins-Liste

Zeigt pendingRequestCount pro Zeile — schneller Überblick, welche
Vereine offene Zugriffsanfragen haben, ohne jeden einzeln zu öffnen.
EOF
)"
```

---

## Manual Verification (Staging)

Kein lokaler Dev-Server (Projekt-Konvention: immer auf Staging via Push auf `main` verifizieren). Nach Deploy:

1. Auf einem Test-Verein die Subscription auf `paused` setzen (z.B. via `/admin/vereine/<slug>` → „Sub pausieren").
2. Mit einem Zweit-Account eine Zugriffs-Anfrage für diesen Verein stellen (`/onboarding/zugriff-anfragen?club=<slug>`).
3. Bestätigen: Als Club-Admin selbst eingeloggt, ist „Annehmen" auf `/verein/<slug>/einstellungen/mitglieder` blockiert (Subscription-Gate-Fehler) — das ist der bestehende, unveränderte Blocker.
4. Als Operator (`johannes.schartl@gmail.com`) auf `/admin/vereine` einloggen: Badge „1" neben dem Test-Verein sehen.
5. In den Verein reingehen (`/admin/vereine/<slug>`): Sektion „Offene Anfragen" zeigt die Anfrage.
6. „Annehmen" klicken → Confirm-Dialog bestätigen → Toast „Zugriff freigegeben".
7. Prüfen: der Requester-Account hat jetzt die Membership (z.B. neu einloggen und Zugriff prüfen), hat eine Mail bekommen, und `/admin/audit-log` zeigt den neuen Eintrag `club.membership_request_approve`.
8. Zweite Anfrage stellen, diesmal über „Ablehnen" mit Grund ablehnen → Toast „Abgelehnt", Requester bekommt Absage-Mail mit Begründung, Audit-Log zeigt `club.membership_request_reject`.
