# Phase B: Smart Routing + Role-Picker + Header Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Phase-A `getUserIdentities` query into the user-facing flow — `/dashboard` smart-routes (0/1/2+ identities), `/select-role` lets multi-role users pick an identity to act under, and the header dropdown becomes an in-session role switcher.

**Architecture:** Two pure helpers (`pickDashboardDestination`, `activeIdentityFromPath`) live in `lib/auth/identity-routing.ts` and are unit-tested. `/dashboard/page.tsx` becomes a 10-line redirect using them. A new `/api/user/roles` JSON endpoint exposes the identity snapshot for the client-side header. `/select-role` is a Server Component that renders identity tiles. `HeaderUserMenu` consumes `/api/user/roles` (in parallel with the existing `/api/user/context` — both run, the latter gets deprecated in a later cleanup).

**Tech Stack:** Next.js 15 App Router, better-auth, Drizzle (via Phase-A `getUserIdentities`), shadcn/ui (Card, DropdownMenu, Avatar), Vitest.

**Source spec:** [docs/superpowers/specs/2026-05-22-identity-roles-mobile-ia-design.md](../specs/2026-05-22-identity-roles-mobile-ia-design.md) §5 (Smart Post-Login Routing).

**Phase-A dependencies (already shipped):**
- `getUserIdentities(userId): Promise<UserIdentities>` in `lib/db/queries/user-identities.ts`
- Types `UserIdentities`, `UserIdentityClub`, `UserIdentityTeamOnly`, `UserIdentitySponsor` from same module

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Create | `lib/auth/identity-routing.ts` | Pure helpers `pickDashboardDestination` + `activeIdentityFromPath` + `ActiveIdentity` type |
| Create | `tests/lib/identity-routing.test.ts` | Vitest pure-function tests for both helpers |
| Modify | `app/dashboard/page.tsx` | Replace ad-hoc query with `getUserIdentities` + `pickDashboardDestination` redirect |
| Create | `app/api/user/roles/route.ts` | GET handler returning the identity snapshot as JSON |
| Create | `app/select-role/page.tsx` | Server Component rendering one card per identity + "Neue Rolle"-Card |
| Modify | `components/auth/header-user-menu.tsx` | Extend signed-in dropdown with "Aktuelle Rolle" + "Wechseln zu" sections |

No new layout: root `app/layout.tsx` already injects `AppHeader`. `/select-role` renders inside that header.

---

## Task 1: Pure routing helpers + tests

**Files:**
- Create: `lib/auth/identity-routing.ts`
- Create: `tests/lib/identity-routing.test.ts`

- [ ] **Step 1.1: Write the failing test file**

Create `tests/lib/identity-routing.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  pickDashboardDestination,
  activeIdentityFromPath,
  type ActiveIdentity
} from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";

function emptyIdentities(): UserIdentities {
  return { clubs: [], teamOnly: [], sponsor: null };
}

function clubIdentity(slug: string): UserIdentities["clubs"][number] {
  return {
    clubId: `club-${slug}`,
    slug,
    name: `Club ${slug}`,
    logoUrl: null,
    role: "admin",
    teamCount: 3,
    sponsorCount: 5
  };
}

function teamOnlyIdentity(clubSlug: string, teamId: string): UserIdentities["teamOnly"][number] {
  return {
    teamId,
    teamName: "C-Jugend",
    clubSlug,
    clubName: `Club ${clubSlug}`,
    role: "trainer",
    saison: "2526"
  };
}

function sponsorIdentity(): UserIdentities["sponsor"] {
  return {
    id: "sp-1",
    displayName: "Tante Erna",
    activePledgeCount: 2,
    thisMonthCents: 1500
  };
}

describe("pickDashboardDestination", () => {
  it("zero identities → /signup", () => {
    expect(pickDashboardDestination(emptyIdentities())).toBe("/signup");
  });

  it("one club → /verein/{slug}", () => {
    const ids: UserIdentities = { clubs: [clubIdentity("acn")], teamOnly: [], sponsor: null };
    expect(pickDashboardDestination(ids)).toBe("/verein/acn");
  });

  it("one team-only → /verein/{clubSlug}/mannschaft/{teamId}", () => {
    const ids: UserIdentities = {
      clubs: [],
      teamOnly: [teamOnlyIdentity("acn", "team-42")],
      sponsor: null
    };
    expect(pickDashboardDestination(ids)).toBe("/verein/acn/mannschaft/team-42");
  });

  it("one sponsor → /sponsor", () => {
    const ids: UserIdentities = { clubs: [], teamOnly: [], sponsor: sponsorIdentity() };
    expect(pickDashboardDestination(ids)).toBe("/sponsor");
  });

  it("multi (club + sponsor) → /select-role", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("acn")],
      teamOnly: [],
      sponsor: sponsorIdentity()
    };
    expect(pickDashboardDestination(ids)).toBe("/select-role");
  });

  it("multi (two clubs) → /select-role", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("acn"), clubIdentity("dossi")],
      teamOnly: [],
      sponsor: null
    };
    expect(pickDashboardDestination(ids)).toBe("/select-role");
  });

  it("multi (club + team-only in different club) → /select-role", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("acn")],
      teamOnly: [teamOnlyIdentity("dossi", "team-9")],
      sponsor: null
    };
    expect(pickDashboardDestination(ids)).toBe("/select-role");
  });
});

describe("activeIdentityFromPath", () => {
  it("/ → neutral", () => {
    const r: ActiveIdentity = activeIdentityFromPath("/");
    expect(r.kind).toBe("neutral");
  });

  it("/login → neutral", () => {
    expect(activeIdentityFromPath("/login").kind).toBe("neutral");
  });

  it("/select-role → neutral", () => {
    expect(activeIdentityFromPath("/select-role").kind).toBe("neutral");
  });

  it("/verein/asc-neuenheim → club with slug", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim");
    expect(r.kind).toBe("club");
    if (r.kind !== "club") return;
    expect(r.slug).toBe("asc-neuenheim");
  });

  it("/verein/asc-neuenheim/sponsoren → still club (subroute)", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim/sponsoren");
    expect(r.kind).toBe("club");
    if (r.kind !== "club") return;
    expect(r.slug).toBe("asc-neuenheim");
  });

  it("/verein/asc-neuenheim/mannschaft/team-42 → team", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim/mannschaft/team-42");
    expect(r.kind).toBe("team");
    if (r.kind !== "team") return;
    expect(r.slug).toBe("asc-neuenheim");
    expect(r.teamId).toBe("team-42");
  });

  it("/verein/asc-neuenheim/mannschaft/team-42/spiel/m-1 → team (deeper subroute)", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim/mannschaft/team-42/spiel/m-1");
    expect(r.kind).toBe("team");
    if (r.kind !== "team") return;
    expect(r.slug).toBe("asc-neuenheim");
    expect(r.teamId).toBe("team-42");
  });

  it("/sponsor → sponsor", () => {
    expect(activeIdentityFromPath("/sponsor").kind).toBe("sponsor");
  });

  it("/sponsor/discover → sponsor", () => {
    expect(activeIdentityFromPath("/sponsor/discover").kind).toBe("sponsor");
  });

  it("/dashboard → neutral (transitional)", () => {
    expect(activeIdentityFromPath("/dashboard").kind).toBe("neutral");
  });
});
```

- [ ] **Step 1.2: Run the test, verify it fails**

Run:

```bash
npx vitest run tests/lib/identity-routing.test.ts 2>&1 | tail -25
```

Expected: import error — module doesn't exist.

- [ ] **Step 1.3: Implement the helpers**

Create `lib/auth/identity-routing.ts`:

```ts
import type { UserIdentities } from "@/lib/db/queries/user-identities";

/**
 * Active identity inferred from the URL pathname. No session state — the URL
 * IS the role context. Header dropdown highlights the matching identity.
 */
export type ActiveIdentity =
  | { kind: "club"; slug: string }
  | { kind: "team"; slug: string; teamId: string }
  | { kind: "sponsor" }
  | { kind: "neutral" };

/**
 * Smart post-login destination based on the user's identity snapshot.
 *
 * - 0 identities → /signup (3-card chooser)
 * - 1 identity → direct to that identity's home URL
 * - 2+ identities → /select-role (multi-role picker)
 */
export function pickDashboardDestination(ids: UserIdentities): string {
  const total = ids.clubs.length + ids.teamOnly.length + (ids.sponsor ? 1 : 0);
  if (total === 0) return "/signup";
  if (total >= 2) return "/select-role";

  // exactly one
  if (ids.clubs[0]) return `/verein/${ids.clubs[0].slug}`;
  if (ids.teamOnly[0]) {
    return `/verein/${ids.teamOnly[0].clubSlug}/mannschaft/${ids.teamOnly[0].teamId}`;
  }
  return "/sponsor";
}

const TEAM_PATH = /^\/verein\/([^/]+)\/mannschaft\/([^/]+)/;
const CLUB_PATH = /^\/verein\/([^/]+)/;
const SPONSOR_PATH = /^\/sponsor(\/|$)/;

/**
 * Maps a pathname to the active identity context. Team routes match before
 * club routes (more specific first). Auth/signup/dashboard/select-role return
 * neutral — those pages aren't "inside" any identity.
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
```

- [ ] **Step 1.4: Run the tests, verify they pass**

Run:

```bash
npx vitest run tests/lib/identity-routing.test.ts 2>&1 | tail -25
```

Expected: 17 passed (7 for `pickDashboardDestination` + 10 for `activeIdentityFromPath`).

- [ ] **Step 1.5: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "identity-routing" | head -5
```

Expected: empty.

- [ ] **Step 1.6: Commit**

```bash
git add lib/auth/identity-routing.ts tests/lib/identity-routing.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): pure identity-routing helpers (pickDashboardDestination + activeIdentityFromPath)

Two pure functions consumed by /dashboard smart routing and the header role-switcher. pickDashboardDestination maps a UserIdentities snapshot to a redirect URL (0=/signup, 1=direct, 2+=/select-role). activeIdentityFromPath parses the current URL into a discriminated union {club|team|sponsor|neutral} so the header can highlight the matching identity. Both unit-tested in isolation; 17 scenarios.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Rewrite `/dashboard` with smart routing

**Files:**
- Modify: `app/dashboard/page.tsx`

The current page hand-queries memberships then redirects. Replace with a single `getUserIdentities` + `pickDashboardDestination` call.

- [ ] **Step 2.1: Rewrite the page**

Open `app/dashboard/page.tsx` and replace the entire file with:

```ts
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";

/**
 * Smart post-login dispatcher. Loads the user's identity snapshot once and
 * redirects to the right destination:
 *   - 0 identities → /signup (3-card role chooser)
 *   - 1 identity → that identity's home URL
 *   - 2+ identities → /select-role (multi-role picker)
 *
 * All routing logic lives in pickDashboardDestination (pure, unit-tested).
 */
export default async function DashboardRedirect() {
  const user = await requireUser();
  const identities = await getUserIdentities(user.id);
  redirect(pickDashboardDestination(identities));
}
```

- [ ] **Step 2.2: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "dashboard/page" | head -5
```

Expected: empty.

- [ ] **Step 2.3: Manual smoke (optional but recommended)**

If the dev server is up, visit `http://localhost:3000/dashboard` while logged in. Confirm it redirects somewhere sensible (your actual club, `/select-role`, etc.) — not into the old ad-hoc fallback.

This step is observation-only; don't block the commit on it.

- [ ] **Step 2.4: Commit**

```bash
git add app/dashboard/page.tsx
git commit -m "$(cat <<'EOF'
refactor(dashboard): smart post-login routing via getUserIdentities

Replace the ad-hoc club/sponsor lookup with a single getUserIdentities call followed by pickDashboardDestination. 0-identity users now go to /signup (was: /sponsor); multi-role users go to /select-role (new). Single-identity behavior is preserved.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/api/user/roles` route

**Files:**
- Create: `app/api/user/roles/route.ts`

Mirror the shape and conventions of `app/api/user/context/route.ts`. Auth-guarded with `getServerSession`; returns 401 for unauthenticated, JSON snapshot otherwise.

- [ ] **Step 3.1: Implement the route**

Create `app/api/user/roles/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";

export const dynamic = "force-dynamic";

/**
 * Returns the authenticated user's full identity snapshot
 * (clubs, team-only memberships, sponsor profile) for the header
 * role-switcher dropdown.
 *
 * Unauthenticated requests → 401 with an empty payload so the client
 * can fall back gracefully without throwing.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { clubs: [], teamOnly: [], sponsor: null },
      { status: 401 }
    );
  }
  const identities = await getUserIdentities(session.user.id);
  return NextResponse.json(identities);
}
```

- [ ] **Step 3.2: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "api/user/roles" | head -5
```

Expected: empty.

- [ ] **Step 3.3: Smoke test (optional)**

If the dev server is up:

```bash
curl -s -b "kickpact_session=$YOUR_COOKIE" http://localhost:3000/api/user/roles | jq .
```

Without a cookie you'll get 401 + `{clubs:[], teamOnly:[], sponsor:null}`. With a valid session, the full snapshot. Skip if no dev server.

- [ ] **Step 3.4: Commit**

```bash
git add app/api/user/roles/route.ts
git commit -m "$(cat <<'EOF'
feat(api): /api/user/roles returns full identity snapshot

Thin auth-guarded wrapper around getUserIdentities for the client-side header role-switcher. Lives alongside the existing /api/user/context (which the header still uses for legacy bits — superseded once the switcher refactor lands).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `/select-role` page

**Files:**
- Create: `app/select-role/page.tsx`

Server Component. Loads the snapshot, renders one card per identity, plus a "+ Neue Rolle"-Card linking to `/signup`. No custom layout — root layout's `AppHeader` is fine (the dropdown will show "neutral" current-role since `/select-role` matches no identity URL).

Edge case: if the user lands on `/select-role` with 0 or 1 identities (e.g., from a bookmark), redirect them — `/select-role` is only for 2+. Use `pickDashboardDestination` to figure out where they belong instead.

- [ ] **Step 4.1: Implement the page**

Create `app/select-role/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { pickDashboardDestination } from "@/lib/auth/identity-routing";

export const metadata = { title: "Rolle wählen · KickPact" };

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function SelectRolePage() {
  const user = await requireUser();
  const identities = await getUserIdentities(user.id);

  // If the user landed here with 0 or 1 identity (bookmark, refresh after
  // role-revocation, etc.), bounce them to where they actually belong.
  const total =
    identities.clubs.length + identities.teamOnly.length + (identities.sponsor ? 1 : 0);
  if (total < 2) {
    redirect(pickDashboardDestination(identities));
  }

  return (
    <main className="mx-auto max-w-4xl px-5 md:px-6 py-12 md:py-16">
      <div className="mb-8 md:mb-10 text-center">
        <h1 className="font-display font-black text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Mit welcher Rolle willst du arbeiten?
        </h1>
        <p className="mt-2 md:mt-3 text-sm md:text-base text-brand-night-navy/60 max-w-xl mx-auto">
          Du bist in {total} Rollen unterwegs. Wähle eine — du kannst jederzeit oben rechts wechseln.
        </p>
      </div>

      <div className="grid gap-4 md:gap-5 md:grid-cols-2">
        {identities.clubs.map((c) => (
          <Link
            key={`club-${c.clubId}`}
            href={`/verein/${c.slug}`}
            className="group flex items-start gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-5 transition-all hover:border-accent hover:shadow-md"
          >
            <div className="text-3xl shrink-0">🏟️</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                  {c.name}
                </h2>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                  {ROLE_LABEL[c.role]}
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-night-navy/60">
                {c.teamCount} Mannschaft{c.teamCount === 1 ? "" : "en"} · {c.sponsorCount} aktive Sponsor{c.sponsorCount === 1 ? "" : "en"}
              </p>
              <div className="mt-3 inline-flex items-center text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                Weiter →
              </div>
            </div>
          </Link>
        ))}

        {identities.teamOnly.map((t) => (
          <Link
            key={`team-${t.teamId}`}
            href={`/verein/${t.clubSlug}/mannschaft/${t.teamId}`}
            className="group flex items-start gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-5 transition-all hover:border-accent hover:shadow-md"
          >
            <div className="text-3xl shrink-0">⚽</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                  {t.teamName}
                </h2>
                <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                  {ROLE_LABEL[t.role]}
                </span>
              </div>
              <p className="mt-1 text-xs text-brand-night-navy/60 truncate">
                {t.clubName} · Saison {t.saison}
              </p>
              <div className="mt-3 inline-flex items-center text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                Weiter →
              </div>
            </div>
          </Link>
        ))}

        {identities.sponsor && (
          <Link
            href="/sponsor"
            className="group flex items-start gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-5 transition-all hover:border-accent hover:shadow-md"
          >
            <div className="text-3xl shrink-0">💚</div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy truncate">
                {identities.sponsor.displayName}
              </h2>
              <p className="mt-1 text-xs text-brand-night-navy/60">
                {identities.sponsor.activePledgeCount} aktive Pledge{identities.sponsor.activePledgeCount === 1 ? "" : "s"}
                {identities.sponsor.thisMonthCents > 0 && (
                  <> · {eur(identities.sponsor.thisMonthCents)} diesen Monat</>
                )}
              </p>
              <div className="mt-3 inline-flex items-center text-xs font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                Sponsor-Dashboard →
              </div>
            </div>
          </Link>
        )}

        <Link
          href="/signup"
          className="group flex items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-brand-neutral/60 bg-transparent p-5 text-sm font-semibold text-brand-night-navy/60 transition-all hover:border-accent hover:text-accent hover:bg-accent/5"
        >
          <span className="text-2xl">+</span>
          <span>Neue Rolle hinzufügen</span>
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 4.2: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "select-role" | head -5
```

Expected: empty.

- [ ] **Step 4.3: Commit**

```bash
git add app/select-role/page.tsx
git commit -m "$(cat <<'EOF'
feat(select-role): identity-picker page for multi-role users

Server Component that renders one card per active identity (club / team-only / sponsor) plus a "+ Neue Rolle"-Card. If a user lands here with <2 identities (bookmark, refresh after revocation), bounce them via pickDashboardDestination instead of showing a one-item picker. Mobile-stack, desktop 2-col grid, brand-styled cards.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Header role-switcher

**Files:**
- Modify: `components/auth/header-user-menu.tsx`

Extend the signed-in dropdown with two new sections built from `/api/user/roles`: a highlighted "Aktuelle Rolle" entry (derived from `activeIdentityFromPath(pathname)`) and a "Wechseln zu"-list of all *other* identities. Plus a "+ Neue Rolle hinzufügen" link. Keep the existing "Angemeldet als" header and "Abmelden" footer.

The existing `/api/user/context` fetch stays (other consumers may depend on it). The new `/api/user/roles` fetch is added in parallel. Both populate independent state — the legacy `ctx.hasSponsor`/`ctx.clubs` is no longer used by the dropdown items, but we don't rip out the API yet.

- [ ] **Step 5.1: Rewrite header-user-menu.tsx**

Replace the entire file `components/auth/header-user-menu.tsx` with:

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";
import { useSession, signOut } from "@/lib/auth/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { activeIdentityFromPath, type ActiveIdentity } from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

type IdentityEntry =
  | { kind: "club"; id: string; href: string; label: string; subline: string; matches: (a: ActiveIdentity) => boolean }
  | { kind: "team"; id: string; href: string; label: string; subline: string; matches: (a: ActiveIdentity) => boolean }
  | { kind: "sponsor"; id: string; href: string; label: string; subline: string; matches: (a: ActiveIdentity) => boolean };

function flattenIdentities(ids: UserIdentities): IdentityEntry[] {
  const entries: IdentityEntry[] = [];
  for (const c of ids.clubs) {
    entries.push({
      kind: "club",
      id: `club-${c.clubId}`,
      href: `/verein/${c.slug}`,
      label: c.name,
      subline: ROLE_LABEL[c.role],
      matches: (a) => a.kind === "club" && a.slug === c.slug
    });
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

function emojiFor(kind: IdentityEntry["kind"]): string {
  if (kind === "club") return "🏟️";
  if (kind === "team") return "⚽";
  return "💚";
}

export function HeaderUserMenu({ onHero = false }: { onHero?: boolean }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [identities, setIdentities] = useState<UserIdentities | null>(null);

  useEffect(() => {
    if (!session?.user) {
      setIdentities(null);
      return;
    }
    fetch("/api/user/roles")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIdentities(d))
      .catch(() => {/* silent */});
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPending) {
    return <div className="h-9 w-20 animate-pulse rounded-md bg-white/10" />;
  }

  if (!session?.user) {
    const linkBase = "text-sm font-semibold transition-colors";
    const linkColor = onHero
      ? "text-white/90 hover:text-white drop-shadow-sm"
      : "text-brand-night-navy/70 hover:text-brand-night-navy";
    return (
      <>
        <nav className="hidden sm:flex items-center gap-5">
          <Link href="/login" className={cn(linkBase, linkColor)}>
            Login
          </Link>
          <span
            aria-hidden
            className={cn(
              "h-4 w-px",
              onHero ? "bg-white/30" : "bg-brand-night-navy/20"
            )}
          />
          <Link href="/signup" className={cn(linkBase, linkColor)}>
            Mannschaft anlegen
          </Link>
        </nav>
        <nav className="sm:hidden">
          <Link href="/signup" className={cn(linkBase, linkColor)}>
            Loslegen →
          </Link>
        </nav>
      </>
    );
  }

  const initials =
    session.user.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? session.user.email[0].toUpperCase();

  const entries = identities ? flattenIdentities(identities) : [];
  const active = activeIdentityFromPath(pathname);
  const currentEntry = entries.find((e) => e.matches(active)) ?? null;
  const otherEntries = entries.filter((e) => !e.matches(active));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "gap-2 rounded-full px-2 md:px-3",
            onHero && "text-white hover:bg-white/10 hover:text-white"
          )}
        >
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-accent text-white text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span
            className={cn(
              "hidden md:inline max-w-[12rem] truncate font-medium",
              onHero ? "text-white drop-shadow-sm" : "text-brand-night-navy"
            )}
          >
            {currentEntry?.label ?? session.user.name ?? session.user.email}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-72 bg-white text-brand-night-navy border border-brand-neutral/40 shadow-lg"
      >
        <DropdownMenuLabel className="px-3 py-2">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
            Angemeldet als
          </div>
          <div className="mt-0.5 truncate font-medium text-brand-night-navy">
            {session.user.email}
          </div>
        </DropdownMenuLabel>

        {currentEntry && (
          <>
            <DropdownMenuSeparator className="bg-brand-neutral/40" />
            <DropdownMenuLabel className="px-3 pt-2 pb-1">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                Aktuelle Rolle
              </div>
            </DropdownMenuLabel>
            <DropdownMenuItem
              asChild
              className="cursor-pointer text-brand-night-navy bg-accent/5 focus:bg-accent/10 focus:text-accent-dark"
            >
              <Link href={currentEntry.href}>
                <span className="mr-2 text-base">{emojiFor(currentEntry.kind)}</span>
                <span className="flex-1 truncate">
                  <span className="block truncate font-semibold">{currentEntry.label}</span>
                  <span className="block truncate text-[0.7rem] text-brand-night-navy/60">
                    {currentEntry.subline}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          </>
        )}

        {otherEntries.length > 0 && (
          <>
            <DropdownMenuSeparator className="bg-brand-neutral/40" />
            <DropdownMenuLabel className="px-3 pt-2 pb-1">
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-500">
                Wechseln zu
              </div>
            </DropdownMenuLabel>
            {otherEntries.map((e) => (
              <DropdownMenuItem
                key={e.id}
                asChild
                className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
              >
                <Link href={e.href}>
                  <span className="mr-2 text-base">{emojiFor(e.kind)}</span>
                  <span className="flex-1 truncate">
                    <span className="block truncate font-medium">{e.label}</span>
                    <span className="block truncate text-[0.7rem] text-brand-night-navy/60">
                      {e.subline}
                    </span>
                  </span>
                </Link>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator className="bg-brand-neutral/40" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
        >
          <Link href="/signup">
            <span className="mr-2 text-base">+</span>Neue Rolle hinzufügen
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator className="bg-brand-neutral/40" />
        <DropdownMenuItem
          className="cursor-pointer text-brand-night-navy focus:bg-accent/10 focus:text-accent-dark"
          onSelect={async () => {
            await signOut();
            router.push("/");
            router.refresh();
          }}
        >
          Abmelden
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 5.2: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "header-user-menu" | head -5
```

Expected: empty.

- [ ] **Step 5.3: Visual smoke (optional)**

If dev server is up: visit `/verein/{your-club}` while logged in. Open the avatar dropdown. Confirm:
- "Aktuelle Rolle" section highlights the current club
- "Wechseln zu" shows other clubs / sponsor (if you have any)
- "+ Neue Rolle hinzufügen" links to /signup

Skip if you don't have a multi-role test account.

- [ ] **Step 5.4: Commit**

```bash
git add components/auth/header-user-menu.tsx
git commit -m "$(cat <<'EOF'
feat(header): role-switcher dropdown with current + other identities

Replace the static "clubs + sponsor"-list dropdown with a structured role-switcher: "Angemeldet als" (email), "Aktuelle Rolle" (highlighted, derived from URL via activeIdentityFromPath), "Wechseln zu" (all other identities), "+ Neue Rolle", "Abmelden". Data source is the new /api/user/roles endpoint; the legacy /api/user/context fetch is gone from this component.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final check + push

- [ ] **Step 6.1: Full TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -20
```

Expected: clean for Phase B files. Pre-existing errors in scripts may remain — flag but don't fix.

- [ ] **Step 6.2: Full vitest run**

Run:

```bash
npx vitest run --reporter=dot 2>&1 | tail -10
```

Expected: prior count + 17 new tests passing. No new failures.

- [ ] **Step 6.3: Push**

Run:

```bash
git push origin main 2>&1 | tail -5
```

Expected: `main -> main`, no errors.

- [ ] **Step 6.4: Verify sync**

Run:

```bash
git rev-list --left-right --count main...origin/main
```

Expected: `0 0`.

- [ ] **Step 6.5: Phase-B commit summary**

Run:

```bash
git log --oneline -6
```

Expected: top 5 commits are Phase B (helpers, dashboard refactor, /api/user/roles, /select-role page, header switcher) plus any unrelated user commits interleaved.

---

## Done Criteria

1. ✅ `pickDashboardDestination` returns the right URL for 7 scenarios (0/1-club/1-team/1-sponsor + 3 multi cases). All tests pass.
2. ✅ `activeIdentityFromPath` correctly classifies 10 URL patterns including team-vs-club precedence. All tests pass.
3. ✅ `/dashboard` now uses Phase-A `getUserIdentities` + the pure helper; no inline membership queries left in the page.
4. ✅ `/api/user/roles` exists, returns the full identity snapshot for authenticated users, 401 with empty payload for unauthenticated.
5. ✅ `/select-role` renders one card per identity + "Neue Rolle"-Card; bounces single-identity users to their home.
6. ✅ `HeaderUserMenu` dropdown shows "Aktuelle Rolle" (highlighted), "Wechseln zu" (other identities), "+ Neue Rolle", "Abmelden" — built from `/api/user/roles`, with active-identity derived from URL.
7. ✅ All 6 Phase-B commits land on `origin/main`.

Phase B unblocks Phase C (the access-request flow can plug into `/select-role` after-approve and into the header's "+ Neue Rolle" entry) and is independent of Phase D (mobile burger can layer on later).
