# Phase E2: Admin Tooling + Mail Templates + Banner + Conflict-Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the Phase E loop: KickPact-ops can approve/reject verification submissions, requesters get mail at every status change, vereine see their pending-state, sponsors see a warning when sponsoring an unverified verein, and the existing `/onboarding/zugriff-anfragen` flow can carry a "I'm the real club, not the impersonator" conflict-claim with its own document.

**Architecture:** ENV-gated admin layout (`KICKPACT_ADMIN_EMAILS`) with two operator pages (`/admin/verifications`, `/admin/conflicts`). Three new plain-HTML mail templates wire Resend notifications. Approve-action also triggers a withheld-invoice release pass. Conflict-claim extends `club_membership_requests` with two columns + a Sheet-flow in the existing request-form. Banner component reused on Verein-Dashboard and discover-tiles.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Resend, shadcn/ui (Card, Button, Table-like list, Sheet, Textarea), Vitest. Reuses Phase E1's `club_verifications`, `clubs.verifiedAt`, `lib/storage/documents.ts`, query layer.

**Source spec:** [docs/superpowers/specs/2026-05-25-trust-and-payment-model-design.md](../specs/2026-05-25-trust-and-payment-model-design.md) §6 (Verification Flow) + §8 (UX Banners) + §9 (Conflict Resolution) + §10 (Admin Role).

**Phase E1 dependencies (already shipped):**
- `club_verifications` table + `clubs.verifiedAt` column + `invoice_status.withheld` enum value
- `lib/storage/documents.ts` (R2/local-volume)
- `lib/db/queries/verifications.ts` (5 helpers, 6 tests green)
- Onboarding step 4 upload form

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Create | `lib/auth/admin.ts` | `assertPlatformAdmin()` — ENV-allowlist check, redirect to `/dashboard` on fail |
| Create | `app/admin/layout.tsx` | Admin section layout, gates with `assertPlatformAdmin` |
| Create | `app/admin/page.tsx` | Tiny landing page linking to /admin/verifications + /admin/conflicts |
| Create | `lib/mail/templates/verification-submitted.tsx` | „Wir prüfen deinen Verein" to submitter |
| Create | `lib/mail/templates/verification-approved.tsx` | „Verein freigeschaltet" to submitter |
| Create | `lib/mail/templates/verification-rejected.tsx` | „Anfrage abgelehnt, bitte erneut hochladen" to submitter |
| Create | `app/admin/verifications/page.tsx` | Pending-queue list |
| Create | `app/admin/verifications/_components/verifications-table.tsx` | Client-component approve/reject buttons + reject-reason inline textarea |
| Create | `app/admin/verifications/_actions/review.ts` | `approveAction` + `rejectAction` — wraps Phase E1 queries, sends mail, releases withheld invoices on approve |
| Create | `app/api/admin/document/route.ts` | Signed-URL redirect endpoint — admin-gated, takes `?key=` (storage key from `clubVerifications.docStorageKey`) |
| Modify | `app/(onboarding)/onboarding/verein/4/_actions/submit-verification.ts` | After insert, send `verificationSubmittedEmail` to submitter |
| Modify | `lib/db/schema/clubs.ts` | Extend `clubMembershipRequests`: add `isConflictClaim boolean default false` + `conflictDocStorageKey text nullable` |
| Create | `drizzle/migrations/0017_*.sql` | Auto-generated (or hand-written if generator broken — see Phase E1 Task 1 notes) |
| Modify | `app/(onboarding)/onboarding/zugriff-anfragen/_components/request-form.tsx` | Add „Ich bin der eigentliche Vereinsvertreter" Sheet-toggle with file-upload |
| Modify | `app/(onboarding)/onboarding/zugriff-anfragen/_actions/request.ts` | Handle conflict-claim path: upload doc, flag `isConflictClaim=true`, store key |
| Create | `app/admin/conflicts/page.tsx` | Conflict-claim queue (pending requests with `isConflictClaim=true`) |
| Create | `app/admin/conflicts/_components/conflicts-table.tsx` | Side-by-side existing-admin-doc vs claimant-doc, approve-takeover/reject buttons |
| Create | `app/admin/conflicts/_actions/resolve.ts` | `resolveConflictAction` — handles account takeover OR rejection |
| Create | `components/shared/verification-banner.tsx` | Reusable banner component (pending / rejected / approved states) |
| Modify | `app/(verein)/verein/[slug]/layout.tsx` | Show `<VerificationBanner>` if `clubs.verifiedAt IS NULL` |
| Modify | `app/(sponsor)/sponsor/discover/_components/discover-list.tsx` | Add „nicht verifiziert" pill to tiles whose club lacks `verifiedAt` |
| Modify | `lib/db/queries/sponsor-discover.ts` (or wherever the list query is) | Include `clubs.verifiedAt` in returned shape |

---

## Task 1: Admin gate + layout + landing page

**Files:**
- Create: `lib/auth/admin.ts`
- Create: `app/admin/layout.tsx`
- Create: `app/admin/page.tsx`

- [ ] **Step 1.1: Create the gate helper**

Create `lib/auth/admin.ts`:

```ts
import { redirect } from "next/navigation";
import { requireUser } from "./session";

/**
 * ENV-allowlist for KickPact-ops users. Format: comma-separated emails.
 * Example: KICKPACT_ADMIN_EMAILS=johannes@kickpact.de,ops@kickpact.de
 *
 * Deliberately not a DB column — we want admin status to be controlled at
 * the deployment level (Coolify secret), not via a self-service flow.
 * Migrate to a `users.isPlatformAdmin` column when the team grows past 3-5.
 */
function adminEmails(): Set<string> {
  const raw = process.env.KICKPACT_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0)
  );
}

/**
 * Page-level guard for /admin/* routes. Loads the current user, checks
 * email against KICKPACT_ADMIN_EMAILS, redirects to /dashboard on fail.
 * Returns the user so admin pages can show "Reviewed by …" later.
 */
export async function assertPlatformAdmin() {
  const user = await requireUser();
  const allowlist = adminEmails();
  if (allowlist.size === 0 || !allowlist.has(user.email.toLowerCase())) {
    redirect("/dashboard");
  }
  return { user };
}
```

- [ ] **Step 1.2: Create the admin layout**

Create `app/admin/layout.tsx`:

```tsx
import Link from "next/link";
import { assertPlatformAdmin } from "@/lib/auth/admin";

export const metadata = { title: "Admin · KickPact" };

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  await assertPlatformAdmin();

  return (
    <main className="mx-auto max-w-5xl px-5 md:px-6 py-8 md:py-12">
      <div className="mb-6 md:mb-8">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
          KickPact Operator
        </p>
        <h1 className="mt-1 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          Admin
        </h1>
      </div>
      <nav className="mb-8 flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 w-fit">
        <Link
          href="/admin/verifications"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-night-navy/70 hover:text-brand-night-navy hover:bg-white/70 transition-colors"
        >
          Verifications
        </Link>
        <Link
          href="/admin/conflicts"
          className="rounded-xl px-4 py-2 text-sm font-semibold text-brand-night-navy/70 hover:text-brand-night-navy hover:bg-white/70 transition-colors"
        >
          Konflikte
        </Link>
      </nav>
      {children}
    </main>
  );
}
```

- [ ] **Step 1.3: Create the admin landing**

Create `app/admin/page.tsx`:

```tsx
import Link from "next/link";
import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";

export default async function AdminLanding() {
  // Light counts — keep simple, no aggregation pipeline.
  const [{ pending = 0 } = { pending: 0 }] = await db.execute<{ pending: number }>(
    sql`SELECT count(*)::int AS pending FROM club_verifications WHERE status = 'pending'`
  );
  const [{ conflicts = 0 } = { conflicts: 0 }] = await db.execute<{ conflicts: number }>(
    sql`SELECT count(*)::int AS conflicts FROM club_membership_requests WHERE is_conflict_claim = true AND status = 'pending'`
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Link
        href="/admin/verifications"
        className="rounded-2xl border border-brand-neutral/40 bg-white p-6 hover:border-accent hover:shadow-md transition-all"
      >
        <div className="text-3xl mb-2">📋</div>
        <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
          Verifications
        </div>
        <div className="mt-1 font-display font-black text-3xl tracking-tight text-brand-night-navy">
          {pending}
        </div>
        <div className="mt-1 text-xs text-brand-night-navy/60">
          Offene Verein-Verifizierungen
        </div>
      </Link>
      <Link
        href="/admin/conflicts"
        className="rounded-2xl border border-brand-neutral/40 bg-white p-6 hover:border-accent hover:shadow-md transition-all"
      >
        <div className="text-3xl mb-2">⚖️</div>
        <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
          Konflikte
        </div>
        <div className="mt-1 font-display font-black text-3xl tracking-tight text-brand-night-navy">
          {conflicts}
        </div>
        <div className="mt-1 text-xs text-brand-night-navy/60">
          Doppelanmeldungs-Konflikte
        </div>
      </Link>
    </div>
  );
}
```

Note: the conflicts-count query references `is_conflict_claim` which doesn't exist yet — that column is added in Task 4. This file will TypeScript-compile fine (raw SQL), but the query will error at runtime until Task 4 lands. That's OK because /admin/conflicts page also doesn't exist yet — landing-page is informational only and lands after all tasks complete.

If you want to defensive-skip until Task 4: wrap the conflicts-query in try/catch returning 0. Acceptable but verbose; the above is simpler.

- [ ] **Step 1.4: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "lib/auth/admin|app/admin" | head -5
```

Expected: empty.

- [ ] **Step 1.5: Commit (no push)**

```bash
git add lib/auth/admin.ts app/admin/
git commit -m "$(cat <<'EOF'
feat(admin): ENV-gated admin layout + landing with verifications + conflicts counts

assertPlatformAdmin checks the current user's email against KICKPACT_ADMIN_EMAILS (Coolify secret) and redirects non-admins to /dashboard. Admin layout has a sub-nav between Verifications + Konflikte. Landing page shows raw pending-counts as big numbers — operator can see queue length at a glance.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Three mail templates

**Files:**
- Create: `lib/mail/templates/verification-submitted.tsx`
- Create: `lib/mail/templates/verification-approved.tsx`
- Create: `lib/mail/templates/verification-rejected.tsx`

Plain-HTML pattern, mirrors existing `lib/mail/templates/access-request.tsx`. Each is a function returning `{ subject, html, text }` plus a local `escapeHtml` helper.

- [ ] **Step 2.1: Create `verification-submitted.tsx`**

```tsx
export function verificationSubmittedEmail(args: {
  clubName: string;
}): { subject: string; html: string; text: string } {
  const { clubName } = args;

  return {
    subject: `Wir prüfen die Bescheinigung für ${clubName}`,
    text: `Hi,\n\ndanke für deinen Vertretungs-Nachweis für ${clubName}. Unser Team prüft die Bescheinigung manuell — du hörst innerhalb von 1–2 Werktagen von uns.\n\nBis dahin kannst du Mannschaften konfigurieren und Sponsoren einladen. Rechnungen werden zurückgehalten und nach Freischaltung gebündelt verschickt.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Wir prüfen deine Bescheinigung</h1>
      <p style="color: #525252; margin: 0 0 16px;">Danke für deinen Vertretungs-Nachweis für <strong>${escapeHtml(clubName)}</strong>. Unser Team prüft die Bescheinigung manuell — du hörst innerhalb von 1–2 Werktagen von uns.</p>
      <p style="color: #525252; margin: 0;">Bis dahin kannst du Mannschaften konfigurieren und Sponsoren einladen. Rechnungen werden zurückgehalten und nach Freischaltung gebündelt verschickt.</p>
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

- [ ] **Step 2.2: Create `verification-approved.tsx`**

```tsx
export function verificationApprovedEmail(args: {
  clubName: string;
  dashboardUrl: string;
  withheldInvoiceCount: number;
}): { subject: string; html: string; text: string } {
  const { clubName, dashboardUrl, withheldInvoiceCount } = args;
  const invoiceLine =
    withheldInvoiceCount > 0
      ? `\n\nWir haben ${withheldInvoiceCount} Rechnung${withheldInvoiceCount === 1 ? "" : "en"} versandt, die wir bis zur Freischaltung zurückgehalten hatten.`
      : "";
  const invoiceHtml =
    withheldInvoiceCount > 0
      ? `<p style="color: #525252; margin: 0 0 16px;">Wir haben <strong>${withheldInvoiceCount}</strong> Rechnung${withheldInvoiceCount === 1 ? "" : "en"} versandt, die wir bis zur Freischaltung zurückgehalten hatten.</p>`
      : "";

  return {
    subject: `${clubName} ist freigeschaltet ✓`,
    text: `Hi,\n\n${clubName} ist verifiziert und vollständig freigeschaltet. Sponsoren können jetzt ohne Banner pledgen und Rechnungen gehen automatisch raus.${invoiceLine}\n\nDashboard: ${dashboardUrl}\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">${escapeHtml(clubName)} ist freigeschaltet ✓</h1>
      <p style="color: #525252; margin: 0 0 16px;">Dein Verein ist verifiziert und vollständig aktiv. Sponsoren können jetzt ohne Hinweis pledgen, Rechnungen gehen automatisch raus.</p>
      ${invoiceHtml}
      <a href="${dashboardUrl}" style="display: inline-block; background:#01C457; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Zum Dashboard</a>
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

- [ ] **Step 2.3: Create `verification-rejected.tsx`**

```tsx
export function verificationRejectedEmail(args: {
  clubName: string;
  reason: string;
  reuploadUrl: string;
}): { subject: string; html: string; text: string } {
  const { clubName, reason, reuploadUrl } = args;

  return {
    subject: `Bescheinigung für ${clubName} abgelehnt`,
    text: `Hi,\n\nwir konnten deinen Vertretungs-Nachweis für ${clubName} nicht akzeptieren.\n\nBegründung: "${reason}"\n\nDu kannst eine neue Bescheinigung hochladen: ${reuploadUrl}\n\nFalls du Fragen hast, schreib uns an support@kickpact.de.\n\n— KickPact`,
    html: `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; background:#fafafa; padding: 40px 20px;">
  <table style="max-width: 520px; margin: 0 auto; background:#fff; border-radius:12px; padding: 40px;">
    <tr><td>
      <h1 style="font-size: 24px; margin: 0 0 8px;">Bescheinigung abgelehnt</h1>
      <p style="color: #525252; margin: 0 0 16px;">Wir konnten deinen Vertretungs-Nachweis für <strong>${escapeHtml(clubName)}</strong> nicht akzeptieren.</p>
      <blockquote style="border-left: 3px solid #a3a3a3; padding: 8px 16px; margin: 16px 0; color: #525252; background: #fafafa;">${escapeHtml(reason)}</blockquote>
      <a href="${reuploadUrl}" style="display: inline-block; background:#FF5722; color:#fff; text-decoration:none; padding: 14px 28px; border-radius:8px; font-weight: 600;">Neue Bescheinigung hochladen</a>
      <p style="color: #a3a3a3; font-size: 12px; margin-top: 24px;">Fragen? Schreib uns an support@kickpact.de.</p>
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

- [ ] **Step 2.4: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "mail/templates/verification" | head -5
```

Expected: empty.

- [ ] **Step 2.5: Commit**

```bash
git add lib/mail/templates/verification-submitted.tsx lib/mail/templates/verification-approved.tsx lib/mail/templates/verification-rejected.tsx
git commit -m "$(cat <<'EOF'
feat(mail): three templates for the verification lifecycle

verification-submitted (to submitter at upload time), verification-approved (to submitter on operator approve, includes count of released withheld invoices), verification-rejected (to submitter on operator reject, with reason + re-upload link). Plain-HTML, same convention as access-request templates.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2.6: Wire `verification-submitted` into the upload action**

Open `app/(onboarding)/onboarding/verein/4/_actions/submit-verification.ts`. After the `createVerificationSubmission` call (right before the `redirect(...)`), add:

```ts
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { verificationSubmittedEmail } from "@/lib/mail/templates/verification-submitted";

// ... in the action body, after createVerificationSubmission:
const mail = verificationSubmittedEmail({ clubName: club.name });
// Fire-and-forget — don't block the redirect on mail-send.
resend.emails
  .send({
    from: MAIL_FROM,
    to: user.email,
    subject: mail.subject,
    html: mail.html,
    text: mail.text
  })
  .catch((err) => console.error("[verification-submitted] mail failed", err));
```

The club-name needs to be loaded — adjust the upstream `select` to pull `clubs.name` alongside `clubs.id`:

```ts
const [club] = await db
  .select({ id: clubs.id, name: clubs.name })
  .from(clubs)
  .where(eq(clubs.slug, parsed.data.clubSlug))
  .limit(1);
```

Commit:

```bash
git add app/\(onboarding\)/onboarding/verein/4/_actions/submit-verification.ts
git commit -m "$(cat <<'EOF'
feat(onboarding): mail submitter on verification upload

After the row insert, fire-and-forget verificationSubmittedEmail to the user. Failure is logged but doesn't block the redirect — the verification stands regardless.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Admin verifications page + review actions + withheld-release

**Files:**
- Create: `app/admin/verifications/page.tsx`
- Create: `app/admin/verifications/_components/verifications-table.tsx`
- Create: `app/admin/verifications/_actions/review.ts`
- Create: `app/api/admin/document/route.ts`

- [ ] **Step 3.1: Create the document-download endpoint**

Create `app/api/admin/document/route.ts`:

```ts
import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { getDocumentSignedUrl } from "@/lib/storage/documents";

export const dynamic = "force-dynamic";

/**
 * Admin-only proxy: takes a storage-key (?key=…) and 302-redirects to a
 * signed download URL. Used by the operator's "Download" link on the
 * verifications-table.
 */
export async function GET(req: Request) {
  await assertPlatformAdmin();
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }
  const url = await getDocumentSignedUrl(key, 600);
  // For local:// keys, getDocumentSignedUrl returns a /api/documents/download
  // URL that we don't have a handler for yet — for E2 scope, R2 is the
  // expected production setup. Local-dev: operator opens the file from the
  // local filesystem directly.
  return NextResponse.redirect(url);
}
```

- [ ] **Step 3.2: Create the review server-action**

Create `app/admin/verifications/_actions/review.ts`:

```ts
"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import { clubs, clubVerifications, users } from "@/lib/db/schema";
import { invoices } from "@/lib/db/schema/charges";
import {
  approveVerification,
  rejectVerification,
  getActiveVerificationForClub
} from "@/lib/db/queries/verifications";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { verificationApprovedEmail } from "@/lib/mail/templates/verification-approved";
import { verificationRejectedEmail } from "@/lib/mail/templates/verification-rejected";

const approveSchema = z.object({ verificationId: z.string().min(1) });
const rejectSchema = z.object({
  verificationId: z.string().min(1),
  reason: z.string().min(3).max(500)
});

export async function approveAction(input: { verificationId: string }) {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const baseInfo = await loadVerificationInfo(parsed.data.verificationId);
  if (!baseInfo) {
    return { ok: false as const, error: "Verification nicht gefunden" };
  }

  await approveVerification({
    verificationId: parsed.data.verificationId,
    reviewedByUserId: admin.id
  });

  // Release withheld invoices for this club: set status='sent', send mails.
  const releasedCount = await releaseWithheldInvoices(baseInfo.clubId, baseInfo.clubName);

  // Notify submitter
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const dashboardUrl = `${base}/verein/${baseInfo.clubSlug}`;
  const mail = verificationApprovedEmail({
    clubName: baseInfo.clubName,
    dashboardUrl,
    withheldInvoiceCount: releasedCount
  });
  await resend.emails
    .send({
      from: MAIL_FROM,
      to: baseInfo.submitterEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    })
    .catch((err) => console.error("[verification-approved] mail failed", err));

  revalidatePath("/admin/verifications");
  return { ok: true as const, releasedCount };
}

export async function rejectAction(input: { verificationId: string; reason: string }) {
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Begründung mind. 3 Zeichen" };
  const { user: admin } = await assertPlatformAdmin();

  const baseInfo = await loadVerificationInfo(parsed.data.verificationId);
  if (!baseInfo) {
    return { ok: false as const, error: "Verification nicht gefunden" };
  }

  await rejectVerification({
    verificationId: parsed.data.verificationId,
    reviewedByUserId: admin.id,
    reason: parsed.data.reason
  });

  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const reuploadUrl = `${base}/onboarding/verein/4?slug=${encodeURIComponent(baseInfo.clubSlug)}`;
  const mail = verificationRejectedEmail({
    clubName: baseInfo.clubName,
    reason: parsed.data.reason,
    reuploadUrl
  });
  await resend.emails
    .send({
      from: MAIL_FROM,
      to: baseInfo.submitterEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text
    })
    .catch((err) => console.error("[verification-rejected] mail failed", err));

  revalidatePath("/admin/verifications");
  return { ok: true as const };
}

/**
 * Lookup helper: joins club_verifications → users → clubs to get all the
 * info needed for mail + dashboard link.
 */
async function loadVerificationInfo(verificationId: string): Promise<{
  clubId: string;
  clubSlug: string;
  clubName: string;
  submitterEmail: string;
} | null> {
  const [row] = await db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      submitterEmail: users.email
    })
    .from(clubVerifications)
    .innerJoin(clubs, eq(clubVerifications.clubId, clubs.id))
    .innerJoin(users, eq(clubVerifications.submittedByUserId, users.id))
    .where(eq(clubVerifications.id, verificationId))
    .limit(1);
  return row ?? null;
}

/**
 * After approve, release any withheld invoices for this club: flip
 * status='sent' (the PDF + invoice row already exist from when generate-invoices
 * ran). Returns the count of released invoices for the mail body.
 *
 * NOTE: Phase E2 does NOT re-send the mail to the sponsor — the click-through
 * URL on the sponsor side will simply show a no-longer-withheld invoice next
 * time they look. Auto-mailing released invoices is a Phase E3 nicety.
 */
async function releaseWithheldInvoices(
  clubId: string,
  clubName: string
): Promise<number> {
  void clubName; // Reserved for future mail body
  const result = await db
    .update(invoices)
    .set({ status: "sent" })
    .where(and(eq(invoices.clubId, clubId), eq(invoices.status, "withheld")))
    .returning({ id: invoices.id });
  return result.length;
}
```

The `clubVerifications` import should sit at the top of the file alongside the other schema imports, not mid-file. The `loadVerificationInfo` helper + `releaseWithheldInvoices` helper sit below the two exported actions in the same module.

- [ ] **Step 3.3: Create the page**

Create `app/admin/verifications/page.tsx`:

```tsx
import { listPendingVerifications } from "@/lib/db/queries/verifications";
import { VerificationsTable } from "./_components/verifications-table";

export const metadata = { title: "Verifications · Admin · KickPact" };

const DOC_TYPE_LABEL: Record<string, string> = {
  vereinsregister_auszug: "Vereinsregister-Auszug",
  vorstands_beschluss: "Vorstandsbeschluss",
  vereinssatzung: "Vereinssatzung",
  mitgliederversammlung_protokoll: "MV-Protokoll",
  sonstiges: "Sonstiges"
};

export default async function VerificationsPage() {
  const rows = await listPendingVerifications();

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-8 text-center text-sm text-brand-night-navy/60">
        Keine offenen Verifizierungen.
      </div>
    );
  }

  const tableRows = rows.map((r) => ({
    id: r.id,
    clubName: r.clubName,
    clubSlug: r.clubSlug,
    submitterEmail: r.submitterEmail,
    submitterFullName: r.submitterFullName,
    submitterRole: r.submitterRole,
    submitterNotes: r.submitterNotes,
    docTypeLabel: DOC_TYPE_LABEL[r.docType] ?? r.docType,
    docFilename: r.docFilename,
    docStorageKey: r.docStorageKey,
    submittedAt: r.submittedAt
  }));

  return <VerificationsTable rows={tableRows} />;
}
```

- [ ] **Step 3.4: Create the table component**

Create `app/admin/verifications/_components/verifications-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { approveAction, rejectAction } from "../_actions/review";

export interface RowProps {
  id: string;
  clubName: string;
  clubSlug: string;
  submitterEmail: string;
  submitterFullName: string;
  submitterRole: string;
  submitterNotes: string | null;
  docTypeLabel: string;
  docFilename: string;
  docStorageKey: string;
  submittedAt: Date;
}

export function VerificationsTable({ rows }: { rows: RowProps[] }) {
  const [pending, startTransition] = useTransition();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function onApprove(id: string) {
    startTransition(async () => {
      const res = await approveAction({ verificationId: id });
      if (!res.ok) toast.error(res.error);
      else
        toast.success(
          res.releasedCount > 0
            ? `Freigeschaltet. ${res.releasedCount} Rechnung${res.releasedCount === 1 ? "" : "en"} released.`
            : "Freigeschaltet."
        );
    });
  }

  function onReject(id: string) {
    if (reason.trim().length < 3) {
      toast.error("Bitte Begründung angeben.");
      return;
    }
    startTransition(async () => {
      const res = await rejectAction({
        verificationId: id,
        reason: reason.trim()
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Abgelehnt.");
        setRejectFor(null);
        setReason("");
      }
    });
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border border-brand-neutral/40 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                {r.clubName}
              </div>
              <div className="text-xs text-brand-night-navy/60 mt-0.5">
                Eingereicht{" "}
                {r.submittedAt.toLocaleString("de-DE", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div>
                  <span className="text-brand-night-navy/50">Antragsteller:</span>{" "}
                  <strong>{r.submitterFullName}</strong>
                </div>
                <div>
                  <span className="text-brand-night-navy/50">Rolle:</span>{" "}
                  <strong>{r.submitterRole}</strong>
                </div>
                <div>
                  <span className="text-brand-night-navy/50">E-Mail:</span>{" "}
                  <span className="font-mono text-xs">{r.submitterEmail}</span>
                </div>
                <div>
                  <span className="text-brand-night-navy/50">Doc-Typ:</span>{" "}
                  <strong>{r.docTypeLabel}</strong>
                </div>
              </div>
              {r.submitterNotes && (
                <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-xs text-brand-night-navy/70 italic">
                  „{r.submitterNotes}"
                </blockquote>
              )}
              <div className="mt-3">
                <a
                  href={`/api/admin/document?key=${encodeURIComponent(r.docStorageKey)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                >
                  📎 {r.docFilename}
                </a>
              </div>
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
            <div className="mt-4 space-y-2">
              <Textarea
                placeholder="Begründung (wird dem Anfragenden gemailt)"
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={pending || reason.trim().length < 3}
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

- [ ] **Step 3.5: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "admin/verifications|api/admin/document" | head -10
```

Expected: empty.

- [ ] **Step 3.6: Commit**

```bash
git add app/admin/verifications/ app/api/admin/document/
git commit -m "$(cat <<'EOF'
feat(admin): verifications inbox with approve/reject + withheld-invoice release

Operator-facing /admin/verifications lists pending submissions oldest-first with all submitter details, document download link (proxied through /api/admin/document with signed URL), and inline approve/reject buttons. Approve also flips all withheld invoices for the club to status='sent' (the PDFs are already stored from generate-invoices) and tells the submitter how many were released. Reject requires a >=3-char reason that gets mailed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Conflict-claim schema extension

**Files:**
- Modify: `lib/db/schema/clubs.ts`
- Create: `drizzle/migrations/0017_*.sql`

- [ ] **Step 4.1: Add columns to club_membership_requests**

Open `lib/db/schema/clubs.ts`. Find `clubMembershipRequests` table definition. Add two new columns at the appropriate position (after `respondedByUserId`, before `createdAt`):

```ts
    isConflictClaim: boolean("is_conflict_claim").notNull().default(false),
    conflictDocStorageKey: text("conflict_doc_storage_key"),
```

Required imports: `boolean` should already be present (used elsewhere). If not, add `boolean` to the drizzle-orm import.

- [ ] **Step 4.2: Generate migration**

Run:

```bash
npm run db:generate
```

Expected: `drizzle/migrations/0017_*.sql` containing:
- `ALTER TABLE "club_membership_requests" ADD COLUMN "is_conflict_claim" boolean DEFAULT false NOT NULL`
- `ALTER TABLE "club_membership_requests" ADD COLUMN "conflict_doc_storage_key" text`

If db:generate is still broken (Phase E1 noted snapshot issues), hand-write the migration following the same pattern as 0014/0015/0016 and append to journal.

- [ ] **Step 4.3: Apply migration**

```bash
npm run db:migrate
```

Expected: no errors.

- [ ] **Step 4.4: Verify**

```bash
npx dotenv -e .env.local -- npx tsx -e "import { db } from './lib/db/client'; import { sql } from 'drizzle-orm'; (async () => { const r = await db.execute(sql\`SELECT column_name FROM information_schema.columns WHERE table_name = 'club_membership_requests' AND column_name IN ('is_conflict_claim', 'conflict_doc_storage_key')\`); console.log(r); process.exit(0); })()"
```

Expected: 2 rows.

- [ ] **Step 4.5: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "schema/clubs" | head -5
```

Expected: empty.

- [ ] **Step 4.6: Commit**

```bash
git add lib/db/schema/clubs.ts drizzle/migrations/
git commit -m "$(cat <<'EOF'
feat(schema): conflict-claim extension on club_membership_requests

Two new columns: is_conflict_claim (boolean, default false) flags a request that says "the existing account is an impersonator, I'm the real Verein" — conflict_doc_storage_key holds the Vereinsregister/etc. proof that backs the claim. Regular access-requests stay isConflictClaim=false. Operator picks them up via /admin/conflicts (Task 6).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Conflict-claim flow on /onboarding/zugriff-anfragen

**Files:**
- Modify: `app/(onboarding)/onboarding/zugriff-anfragen/_components/request-form.tsx`
- Modify: `app/(onboarding)/onboarding/zugriff-anfragen/_actions/request.ts`

- [ ] **Step 5.1: Extend the server action**

Open `app/(onboarding)/onboarding/zugriff-anfragen/_actions/request.ts`. The current action takes `{ clubSlug, requestedRole, requestedTeamId, message }`. Extend it:

```ts
const inputSchema = z.object({
  clubSlug: z.string().min(1),
  requestedRole: z.enum(["admin", "trainer", "viewer"]),
  requestedTeamId: z.string().nullable(),
  message: z.string().max(280).nullable(),
  isConflictClaim: z.boolean().optional().default(false)
});
```

Change `requestClubAccessAction` to accept FormData (so we can carry the conflict doc file):

```ts
export async function requestClubAccessAction(formData: FormData) {
  const fields = {
    clubSlug: String(formData.get("clubSlug") ?? ""),
    requestedRole: String(formData.get("requestedRole") ?? "trainer") as
      | "admin"
      | "trainer"
      | "viewer",
    requestedTeamId: formData.get("requestedTeamId")
      ? String(formData.get("requestedTeamId"))
      : null,
    message: formData.get("message") ? String(formData.get("message")) : null,
    isConflictClaim: formData.get("isConflictClaim") === "true"
  };
  const parsed = inputSchema.safeParse(fields);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };

  const user = await requireUser();
  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.slug, parsed.data.clubSlug))
    .limit(1);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };

  const [existing] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, club.id)))
    .limit(1);
  if (existing) {
    return { ok: true as const, alreadyMember: true, clubSlug: club.slug };
  }

  // Conflict-claim path: validate + upload doc
  let conflictDocStorageKey: string | null = null;
  if (parsed.data.isConflictClaim) {
    const file = formData.get("conflictDoc");
    if (!(file instanceof File)) {
      return { ok: false as const, error: "Bei einer Konflikt-Anfrage musst du eine Bescheinigung hochladen." };
    }
    const ALLOWED = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/heic",
      "image/heif"
    ]);
    if (!ALLOWED.has(file.type)) {
      return { ok: false as const, error: "Nur PDF, JPEG, PNG oder HEIC." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false as const, error: "Datei max. 10 MB." };
    }
    const conflictId = createId();
    const key = buildVerificationKey({
      clubId: club.id,
      verificationId: `conflict-${conflictId}`,
      filename: file.name
    });
    const buffer = Buffer.from(await file.arrayBuffer());
    conflictDocStorageKey = await storeDocument(key, buffer, file.type);
  }

  let req;
  try {
    req = await createRequest({
      userId: user.id,
      clubId: club.id,
      requestedRole: parsed.data.requestedRole,
      requestedTeamId: parsed.data.requestedTeamId,
      message: parsed.data.message,
      isConflictClaim: parsed.data.isConflictClaim,
      conflictDocStorageKey
    });
  } catch {
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
  return {
    ok: true as const,
    alreadyMember: false,
    requestId: req.id,
    isConflictClaim: parsed.data.isConflictClaim
  };
}
```

Imports: ensure `createId` from `@paralleldrive/cuid2`, `storeDocument` + `buildVerificationKey` from `@/lib/storage/documents` are at the top.

The `createRequest` query helper (`lib/db/queries/membership-requests.ts`) needs to accept the two new fields. Open it and extend the `CreateRequestArgs` type + insert:

```ts
export interface CreateRequestArgs {
  userId: string;
  clubId: string;
  requestedRole: RequestedRole;
  requestedTeamId: string | null;
  message: string | null;
  isConflictClaim?: boolean;
  conflictDocStorageKey?: string | null;
}

export async function createRequest(args: CreateRequestArgs): Promise<MembershipRequest> {
  const [row] = await db
    .insert(clubMembershipRequests)
    .values({
      userId: args.userId,
      clubId: args.clubId,
      requestedRole: args.requestedRole,
      requestedTeamId: args.requestedTeamId,
      message: args.message,
      isConflictClaim: args.isConflictClaim ?? false,
      conflictDocStorageKey: args.conflictDocStorageKey ?? null
    })
    .returning();
  return row as MembershipRequest;
}
```

Also extend the `MembershipRequest` type to include the two new fields.

- [ ] **Step 5.2: Extend the form**

Open `app/(onboarding)/onboarding/zugriff-anfragen/_components/request-form.tsx`. Add a toggle + conditional file-input section after the existing form fields, BEFORE the submit button. Switch the submit-handler to build FormData:

```tsx
// Add to the schema:
const schema = z.object({
  requestedRole: z.enum(["admin", "trainer", "viewer"]),
  scope: z.enum(["club", "team"]),
  requestedTeamId: z.string().nullable(),
  message: z.string().max(280).optional(),
  isConflictClaim: z.boolean().default(false)
});
```

In the form JSX, before the submit Button, add:

```tsx
<div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      className="mt-1"
      checked={form.watch("isConflictClaim") ?? false}
      onChange={(e) => form.setValue("isConflictClaim", e.target.checked)}
    />
    <span className="text-sm">
      <strong>Ich bin der eigentliche Vereinsvertreter</strong> und der bestehende
      Account ist eine Falschanmeldung.
    </span>
  </label>
  {form.watch("isConflictClaim") && (
    <div className="space-y-2 pt-2 border-t border-amber-200">
      <p className="text-xs text-amber-900/80">
        Lade eine Bescheinigung hoch (Vereinsregister-Auszug, Vorstandsbeschluss, …).
        KickPact prüft beide Seiten und entscheidet anhand der stärkeren Beweisbasis.
      </p>
      <input
        ref={conflictFileRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
        className="block w-full text-sm"
      />
    </div>
  )}
</div>
```

Add at top of the component:

```tsx
const conflictFileRef = useRef<HTMLInputElement>(null);
```

Replace the existing `onSubmit` with a FormData-builder:

```tsx
async function onSubmit(values: FormValues) {
  setPending(true);
  const fd = new FormData();
  fd.set("clubSlug", clubSlug);
  fd.set("requestedRole", values.requestedRole);
  if (values.scope === "team" && values.requestedTeamId) {
    fd.set("requestedTeamId", values.requestedTeamId);
  }
  if (values.message?.trim()) fd.set("message", values.message.trim());
  fd.set("isConflictClaim", String(values.isConflictClaim));
  if (values.isConflictClaim && conflictFileRef.current?.files?.[0]) {
    fd.set("conflictDoc", conflictFileRef.current.files[0]);
  }

  const res = await requestClubAccessAction(fd);
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
  router.push(
    `/onboarding/zugriff-anfragen/gesendet?clubName=${encodeURIComponent(clubName)}${res.isConflictClaim ? "&conflict=1" : ""}`
  );
}
```

Imports at top: ensure `useRef` is added to the React imports.

- [ ] **Step 5.3: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "zugriff-anfragen|membership-requests" | head -10
```

Expected: empty.

- [ ] **Step 5.4: Commit**

```bash
git add app/\(onboarding\)/onboarding/zugriff-anfragen/ lib/db/queries/membership-requests.ts
git commit -m "$(cat <<'EOF'
feat(zugriff-anfragen): conflict-claim flow with document upload

Adds a "Ich bin der eigentliche Vereinsvertreter"-checkbox to the existing access-request form. When toggled on, a file-input appears for the Vereinsregister/Vorstandsbeschluss proof. Server-action switches to FormData to carry the file; on submit, the document is uploaded to documents-storage and the new clubMembershipRequests.isConflictClaim + conflictDocStorageKey fields are set. Operator picks the claim up in /admin/conflicts (next task).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin conflicts queue + resolve action

**Files:**
- Create: `app/admin/conflicts/page.tsx`
- Create: `app/admin/conflicts/_components/conflicts-table.tsx`
- Create: `app/admin/conflicts/_actions/resolve.ts`

- [ ] **Step 6.1: Create the page**

Create `app/admin/conflicts/page.tsx`:

```tsx
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, clubMembershipRequests, users, clubVerifications } from "@/lib/db/schema";
import { ConflictsTable } from "./_components/conflicts-table";

export const metadata = { title: "Konflikte · Admin · KickPact" };

export default async function ConflictsPage() {
  const rows = await db
    .select({
      id: clubMembershipRequests.id,
      clubId: clubs.id,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      claimantEmail: users.email,
      requestedRole: clubMembershipRequests.requestedRole,
      message: clubMembershipRequests.message,
      conflictDocStorageKey: clubMembershipRequests.conflictDocStorageKey,
      createdAt: clubMembershipRequests.createdAt
    })
    .from(clubMembershipRequests)
    .innerJoin(clubs, eq(clubMembershipRequests.clubId, clubs.id))
    .innerJoin(users, eq(clubMembershipRequests.userId, users.id))
    .where(
      and(
        eq(clubMembershipRequests.isConflictClaim, true),
        eq(clubMembershipRequests.status, "pending")
      )
    )
    .orderBy(desc(clubMembershipRequests.createdAt));

  // For each conflict, also fetch the EXISTING admin's verification doc
  // (so operator can compare both sides)
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const [existing] = await db
        .select({
          submitterEmail: users.email,
          submitterFullName: clubVerifications.submitterFullName,
          docStorageKey: clubVerifications.docStorageKey,
          docFilename: clubVerifications.docFilename
        })
        .from(clubVerifications)
        .innerJoin(users, eq(clubVerifications.submittedByUserId, users.id))
        .where(
          and(
            eq(clubVerifications.clubId, r.clubId),
            eq(clubVerifications.status, "approved")
          )
        )
        .orderBy(desc(clubVerifications.reviewedAt))
        .limit(1);
      return {
        ...r,
        existingAdmin: existing ?? null
      };
    })
  );

  if (enriched.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-8 text-center text-sm text-brand-night-navy/60">
        Keine offenen Konflikte.
      </div>
    );
  }

  return <ConflictsTable rows={enriched} />;
}
```

- [ ] **Step 6.2: Create the resolve server-action**

Create `app/admin/conflicts/_actions/resolve.ts`:

```ts
"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import {
  clubs,
  clubMembershipRequests,
  clubMemberships,
  clubVerifications,
  users
} from "@/lib/db/schema";
import { invoices } from "@/lib/db/schema/charges";

const inputSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["claimant_wins", "reject_claim"]),
  reason: z.string().max(500).optional()
});

export async function resolveConflictAction(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const [req] = await db
    .select({
      id: clubMembershipRequests.id,
      userId: clubMembershipRequests.userId,
      clubId: clubMembershipRequests.clubId,
      requestedRole: clubMembershipRequests.requestedRole
    })
    .from(clubMembershipRequests)
    .where(eq(clubMembershipRequests.id, parsed.data.requestId))
    .limit(1);
  if (!req) return { ok: false as const, error: "Konflikt-Anfrage nicht gefunden" };

  if (parsed.data.decision === "reject_claim") {
    await db
      .update(clubMembershipRequests)
      .set({
        status: "rejected",
        respondedAt: new Date(),
        respondedByUserId: admin.id,
        responseMessage: parsed.data.reason ?? null
      })
      .where(eq(clubMembershipRequests.id, req.id));
    revalidatePath("/admin/conflicts");
    return { ok: true as const, action: "rejected" as const };
  }

  // claimant_wins: account takeover
  await db.transaction(async (tx) => {
    // 1. Remove existing admin clubMemberships for this club
    await tx
      .delete(clubMemberships)
      .where(eq(clubMemberships.clubId, req.clubId));

    // 2. Insert claimant as the new admin
    await tx
      .insert(clubMemberships)
      .values({
        userId: req.userId,
        clubId: req.clubId,
        role: "admin"
      })
      .onConflictDoNothing();

    // 3. Mark all prior approved verifications for this club as revoked
    await tx
      .update(clubVerifications)
      .set({ status: "revoked" })
      .where(
        and(
          eq(clubVerifications.clubId, req.clubId),
          eq(clubVerifications.status, "approved")
        )
      );

    // 4. Reset clubs.verifiedAt — the claimant must re-verify too (their
    //    conflict-doc is held as evidence but doesn't auto-promote).
    await tx
      .update(clubs)
      .set({ verifiedAt: null })
      .where(eq(clubs.id, req.clubId));

    // 5. Mark all withheld invoices as cancelled (so the impersonator's
    //    pre-collected charges don't get released by accident).
    //    Note: cancelling=setting status='paid' would be misleading; we
    //    leave them as 'withheld' but ops can manually clean up if needed.
    //    For E2 MVP: don't auto-mutate invoices, just log.
    void tx;

    // 6. Update the conflict request itself
    await tx
      .update(clubMembershipRequests)
      .set({
        status: "approved",
        respondedAt: new Date(),
        respondedByUserId: admin.id,
        responseMessage: parsed.data.reason ?? null
      })
      .where(eq(clubMembershipRequests.id, req.id));
  });

  revalidatePath("/admin/conflicts");
  revalidatePath("/admin/verifications");
  return { ok: true as const, action: "takeover" as const };
}
```

- [ ] **Step 6.3: Create the table component**

Create `app/admin/conflicts/_components/conflicts-table.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { resolveConflictAction } from "../_actions/resolve";

export interface ConflictRow {
  id: string;
  clubName: string;
  clubSlug: string;
  claimantEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  message: string | null;
  conflictDocStorageKey: string | null;
  createdAt: Date;
  existingAdmin: {
    submitterEmail: string;
    submitterFullName: string;
    docStorageKey: string;
    docFilename: string;
  } | null;
}

export function ConflictsTable({ rows }: { rows: ConflictRow[] }) {
  const [pending, startTransition] = useTransition();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function onResolve(
    id: string,
    decision: "claimant_wins" | "reject_claim"
  ) {
    startTransition(async () => {
      const res = await resolveConflictAction({
        requestId: id,
        decision,
        reason: reason.trim() || undefined
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(
          res.action === "takeover"
            ? "Account-Übernahme abgeschlossen."
            : "Konflikt-Anfrage abgelehnt."
        );
        setReasonFor(null);
        setReason("");
      }
    });
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5"
        >
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                {r.clubName}
              </div>
              <div className="text-xs text-brand-night-navy/60">
                Eingereicht{" "}
                {r.createdAt.toLocaleString("de-DE", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {/* Existing admin (current owner) */}
            <div className="rounded-xl border border-brand-neutral/40 bg-white p-4">
              <div className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-2">
                Bestehender Admin
              </div>
              {r.existingAdmin ? (
                <>
                  <div className="font-semibold text-sm">{r.existingAdmin.submitterFullName}</div>
                  <div className="text-xs text-brand-night-navy/60 font-mono">{r.existingAdmin.submitterEmail}</div>
                  <a
                    href={`/api/admin/document?key=${encodeURIComponent(r.existingAdmin.docStorageKey)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                  >
                    📎 {r.existingAdmin.docFilename}
                  </a>
                </>
              ) : (
                <div className="text-xs text-brand-night-navy/60 italic">
                  Kein verifizierter Admin vorhanden (Verein ist noch unverifiziert).
                </div>
              )}
            </div>

            {/* Claimant */}
            <div className="rounded-xl border border-amber-300 bg-white p-4">
              <div className="text-[0.65rem] uppercase tracking-widest font-semibold text-amber-700 mb-2">
                Anfragender (Konflikt-Claim)
              </div>
              <div className="font-semibold text-sm font-mono">{r.claimantEmail}</div>
              <div className="text-xs text-brand-night-navy/60">
                Möchte <strong>{r.requestedRole}</strong>-Zugriff
              </div>
              {r.message && (
                <blockquote className="mt-2 border-l-2 border-amber-400 pl-3 text-xs italic text-brand-night-navy/70">
                  „{r.message}"
                </blockquote>
              )}
              {r.conflictDocStorageKey && (
                <a
                  href={`/api/admin/document?key=${encodeURIComponent(r.conflictDocStorageKey)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                >
                  📎 Konflikt-Bescheinigung
                </a>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {reasonFor === r.id && (
              <Textarea
                placeholder="Optional: Entscheidungsbegründung (intern + an Verlierer-Seite)"
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="accent"
                disabled={pending}
                onClick={() => {
                  setReasonFor(r.id);
                  setTimeout(() => onResolve(r.id, "claimant_wins"), 0);
                }}
              >
                Anfragenden bestätigen (Account-Übernahme)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setReasonFor(r.id);
                  setTimeout(() => onResolve(r.id, "reject_claim"), 0);
                }}
              >
                Claim ablehnen
              </Button>
            </div>
            <p className="text-xs text-brand-night-navy/50">
              Bei Account-Übernahme: bestehende Memberships werden entfernt, bestehende Verifikationen revoked, clubs.verifiedAt zurückgesetzt. Der Anfragende wird neuer Admin und muss separat verifizieren.
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6.4: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "admin/conflicts" | head -5
```

Expected: empty.

- [ ] **Step 6.5: Commit**

```bash
git add app/admin/conflicts/
git commit -m "$(cat <<'EOF'
feat(admin): conflicts queue with side-by-side doc comparison + account takeover

Operator-facing /admin/conflicts lists pending isConflictClaim=true requests. Each row shows both sides side-by-side: existing approved-verification + claimant's conflict-doc, both with proxy download links. Two actions: "Anfragenden bestätigen" (transactional account takeover — wipes memberships, revokes prior verifications, resets clubs.verifiedAt, makes claimant the admin who must re-verify) and "Claim ablehnen" (request marked rejected, optional reason mailed).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Verification banner component + integrations

**Files:**
- Create: `components/shared/verification-banner.tsx`
- Modify: `app/(verein)/verein/[slug]/layout.tsx`
- Modify: `app/(sponsor)/sponsor/discover/_components/discover-list.tsx`
- Modify: `lib/db/queries/sponsor-discover.ts` (or wherever discover loads teams — see Step 7.4)

- [ ] **Step 7.1: Create the banner component**

Create `components/shared/verification-banner.tsx`:

```tsx
import Link from "next/link";
import type { ClubVerification } from "@/lib/db/queries/verifications";

export interface VerificationBannerProps {
  clubSlug: string;
  verification: Pick<ClubVerification, "status" | "rejectionReason"> | null;
}

/**
 * Yellow banner shown on Verein-pages when clubs.verifiedAt IS NULL.
 * Three states keyed on the latest verification submission:
 *   - no submission → call-to-action "Bescheinigung hochladen"
 *   - pending      → "wir prüfen — kann 1-2 Tage dauern"
 *   - rejected     → reason + "neu hochladen"
 */
export function VerificationBanner({ clubSlug, verification }: VerificationBannerProps) {
  const uploadUrl = `/onboarding/verein/4?slug=${encodeURIComponent(clubSlug)}`;

  if (!verification) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>⏳</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-amber-900">
              Verein noch nicht verifiziert
            </div>
            <p className="mt-1 text-xs text-amber-900/80">
              Lade eine Bescheinigung hoch (Vereinsregister-Auszug, Vorstandsbeschluss, …).
              Bis dahin werden Rechnungen zurückgehalten und Sponsoren sehen einen Hinweis.
            </p>
            <Link
              href={uploadUrl}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 underline"
            >
              Bescheinigung hochladen →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (verification.status === "pending") {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 md:p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>📋</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-amber-900">
              Wir prüfen deine Bescheinigung
            </div>
            <p className="mt-1 text-xs text-amber-900/80">
              Innerhalb von 1–2 Werktagen meldet sich unser Team. Bis dahin laufen Pledges,
              Rechnungen werden zurückgehalten.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (verification.status === "rejected") {
    return (
      <div className="rounded-2xl border border-brand-alert-red/40 bg-brand-alert-red/5 p-4 md:p-5 mb-6">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0" aria-hidden>⚠️</span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-brand-alert-red">
              Bescheinigung abgelehnt
            </div>
            {verification.rejectionReason && (
              <blockquote className="mt-1 border-l-2 border-brand-alert-red/40 pl-3 text-xs italic text-brand-night-navy/70">
                {verification.rejectionReason}
              </blockquote>
            )}
            <Link
              href={uploadUrl}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand-alert-red underline"
            >
              Neue Bescheinigung hochladen →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
```

- [ ] **Step 7.2: Integrate into Verein-Layout**

Open `app/(verein)/verein/[slug]/layout.tsx`. Right at the top of the rendered content (above `<VereinSubNav>`), add:

```tsx
import { getActiveVerificationForClub } from "@/lib/db/queries/verifications";
import { VerificationBanner } from "@/components/shared/verification-banner";

// ...inside the component, after `await assertClubAccess(...)`:
const verification = club.verifiedAt
  ? null
  : await getActiveVerificationForClub(club.id);

// ...in the JSX, right above <VereinSubNav>:
{!club.verifiedAt && (
  <VerificationBanner clubSlug={slug} verification={verification} />
)}
```

Note: the `club` returned by `assertClubAccess` must include `verifiedAt`. If the current `assertClubAccess` returns only `{id, slug, name}`, extend the select to include `verifiedAt`. Alternatively, run a single extra `db.select({ verifiedAt: clubs.verifiedAt }).from(clubs).where(eq(clubs.id, club.id))` after the assert — minor inefficiency, easier than touching the scope helper.

For minimum invasiveness: do the extra query in the layout, don't change the scope helper.

- [ ] **Step 7.3: Inspect discover-list structure**

Run:

```bash
cat app/\(sponsor\)/sponsor/discover/_components/discover-list.tsx | head -50
```

Note the data shape it receives and which query feeds it. Then read that query file (most likely `lib/db/queries/sponsor-discover.ts`).

- [ ] **Step 7.4: Extend the discover-query to load verifiedAt**

Open `lib/db/queries/sponsor-discover.ts` (or whichever file feeds the discover-list). Add `clubs.verifiedAt` to the SELECT shape returned. The exact field-name in the return type should be `clubVerifiedAt` (or just `verifiedAt` if no name clash). If the function returns a type, extend it.

- [ ] **Step 7.5: Render the unverified pill on discover tiles**

Open `app/(sponsor)/sponsor/discover/_components/discover-list.tsx`. Where each tile is rendered, add:

```tsx
{!team.clubVerifiedAt && (
  <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-amber-800">
    Nicht verifiziert
  </span>
)}
```

Place it near the club name in the tile header.

Also add a subtle warning to the request-sponsoring Sheet (the one that opens on click). Just above the message-textarea:

```tsx
{!team.clubVerifiedAt && (
  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
    Dieser Verein ist noch nicht verifiziert. Pledges sind möglich, aber wir senden dir
    erst eine Rechnung, sobald KickPact die Vereinsvertretung bestätigt hat.
  </div>
)}
```

- [ ] **Step 7.6: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "verification-banner|verein/\[slug\]/layout|sponsor/discover" | head -10
```

Expected: empty.

- [ ] **Step 7.7: Commit**

```bash
git add components/shared/verification-banner.tsx app/\(verein\)/verein/\[slug\]/layout.tsx lib/db/queries/sponsor-discover.ts app/\(sponsor\)/sponsor/discover/
git commit -m "$(cat <<'EOF'
feat(verification-banner): pending/rejected status banner on Verein + Sponsor-Discover

VerificationBanner renders three states based on the latest verification submission: none (CTA to upload), pending (we're reviewing), rejected (reason + re-upload). Mounted at the top of the Verein-layout when clubs.verifiedAt IS NULL. Sponsor-Discover tiles get a "Nicht verifiziert"-pill + a warning panel in the pledge-request Sheet so sponsors know the invoice won't go out until KickPact-ops confirms the club.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full check + push

- [ ] **Step 8.1: Full TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -15
```

Expected: clean for Phase E2 files.

- [ ] **Step 8.2: Verification-system test suite (E1 carries over)**

Run:

```bash
npx vitest run tests/lib/verifications.test.ts 2>&1 | tail -10
```

Expected: 6 passed (unchanged from E1).

- [ ] **Step 8.3: Push**

```bash
git push origin main 2>&1 | tail -5
```

Expected: `main -> main`.

- [ ] **Step 8.4: Verify sync**

Run:

```bash
git rev-list --left-right --count main...origin/main
```

Expected: `0 0`.

- [ ] **Step 8.5: Set KICKPACT_ADMIN_EMAILS env var (manual, not part of commit)**

On Coolify production: add `KICKPACT_ADMIN_EMAILS=johannes.schartl@gmail.com` (or whatever ops email is) to the app's env. Restart container. Locally: add to `.env.local` so /admin/* is reachable in dev. This is the only manual deployment step.

---

## Done Criteria

1. ✅ `KICKPACT_ADMIN_EMAILS`-gated `/admin/*` layout + landing page with pending counts.
2. ✅ Three mail templates (submitted/approved/rejected) wired into upload action + review actions.
3. ✅ `/admin/verifications` lists pending submissions with download links and approve/reject buttons. Approve releases withheld invoices for that club. Reject requires a reason.
4. ✅ `club_membership_requests` has `isConflictClaim` + `conflictDocStorageKey` columns. Migration applied.
5. ✅ `/onboarding/zugriff-anfragen` has a "Ich bin der eigentliche Vereinsvertreter"-checkbox that reveals a file-input; FormData carries the doc to the server-action.
6. ✅ `/admin/conflicts` lists conflict-claims with side-by-side existing-admin + claimant comparison; account-takeover transactionally swaps memberships and revokes prior verifications.
7. ✅ `VerificationBanner` renders three states (none/pending/rejected) on Verein-layout when `clubs.verifiedAt IS NULL`.
8. ✅ Sponsor-Discover shows "Nicht verifiziert" pill + warning panel for unverified clubs.
9. ✅ All 8 Phase E2 commits land on `origin/main`.

Phase E3 (PDF girocode QR + Sponsor-Side „bezahlt"-Toggle + invoice-mail-wording-update) is a separate plan — independent and most user-visible.
