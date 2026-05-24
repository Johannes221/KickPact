# Phase D: Mobile-IA + Tile-Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the horizontally-scrolling 6-tab sub-nav with a mobile burger drawer + reorganise both the Verein and Sponsor dashboards into tappable tiles so mobile users can reach everything without scrolling sideways.

**Architecture:** Install shadcn `Sheet` (Radix Dialog wrapper). Create one reusable `DashboardTile` component. `VereinSubNav` becomes a responsive component: desktop keeps the horizontal-tab look (without overflow-scroll on this breakpoint), mobile renders a burger that opens a Sheet drawer with all 6 sections. Verein + Sponsor dashboard pages get rewritten as tile grids that link to focused sub-pages.

**Tech Stack:** Next.js 15 App Router, shadcn/ui (Sheet, Card, existing primitives), Tailwind responsive utilities, no new DB work.

**Source spec:** [docs/superpowers/specs/2026-05-22-identity-roles-mobile-ia-design.md](../specs/2026-05-22-identity-roles-mobile-ia-design.md) §7 (Mobile IA + Tile Dashboards).

**Phase A/B/C dependencies (already shipped):** All identity backbone, role-routing, access-request flow are live. Phase D is pure UI — no schema/query changes.

**Out of scope (deferred for later):**
- Floating Action Button (Quick Actions) — not in this plan
- New `/verein/{slug}/mannschaften` standalone route — current Mannschaftsliste stays on Vereins-Dashboard for now; tile reorg surfaces a "Mannschaften"-Tile with mini-grid that links to the first team page (or shows team count + a link to a future overview)
- Sponsor-Discover tile changes
- Floating mobile bottom-nav alternative (rejected during brainstorming)

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Create | `components/ui/sheet.tsx` | shadcn Sheet component (Radix Dialog wrapper) — installed via CLI |
| Create | `components/shared/dashboard-tile.tsx` | Reusable tile primitive used by both dashboards |
| Modify | `app/(verein)/verein/[slug]/_components/verein-sub-nav.tsx` | Add responsive mobile-burger branch using Sheet |
| Modify | `app/(verein)/verein/[slug]/layout.tsx` | Mobile hides the page-level `<h1>` (title moves to burger) |
| Modify | `app/(verein)/verein/[slug]/page.tsx` | Rewrite as tile grid |
| Modify | `app/(sponsor)/sponsor/page.tsx` | Rewrite as tile grid |
| Optional | `package.json` | New dep `@radix-ui/react-dialog` if shadcn add pulls it in |

---

## Task 1: Install shadcn Sheet + DashboardTile component

**Files:**
- Create: `components/ui/sheet.tsx` (via shadcn CLI)
- Create: `components/shared/dashboard-tile.tsx`

- [ ] **Step 1.1: Install shadcn Sheet**

Run:

```bash
npx shadcn@latest add sheet --yes
```

Expected: file created at `components/ui/sheet.tsx`; `package.json` may get a new `@radix-ui/react-dialog` entry. If the CLI fails because the project's components.json is non-default, manually create the file by copying from shadcn-ui docs (see https://ui.shadcn.com/docs/components/sheet).

Verify:

```bash
ls components/ui/sheet.tsx
```

Expected: file exists.

- [ ] **Step 1.2: Create the DashboardTile primitive**

Create `components/shared/dashboard-tile.tsx`:

```tsx
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface DashboardTileProps {
  icon: string;                  // emoji or short string
  title: string;
  primary?: string;              // big number / value
  secondary?: string;            // sub-line
  href?: string;                 // makes the whole tile clickable
  variant?: "default" | "cta";   // cta tiles get accent background
  className?: string;
  children?: React.ReactNode;    // optional custom body below the primary/secondary block
}

/**
 * Reusable tile for the Vereins- and Sponsor-Dashboards. Mobile-stacked,
 * desktop-gridded by parent. Optional href turns the whole surface into a
 * link (anchor, not button — preserves right-click "open in new tab").
 */
export function DashboardTile({
  icon,
  title,
  primary,
  secondary,
  href,
  variant = "default",
  className,
  children
}: DashboardTileProps) {
  const Tag = href ? Link : "div";
  const tagProps = href ? { href } : {};
  return (
    <Tag
      {...(tagProps as { href: string })}
      className={cn(
        "group block rounded-2xl border p-5 transition-all",
        variant === "cta"
          ? "border-accent bg-accent text-white hover:bg-accent-dark"
          : "border-brand-neutral/40 bg-white text-brand-night-navy hover:border-accent/60 hover:shadow-md",
        href && "cursor-pointer",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              "text-[0.65rem] font-semibold uppercase tracking-widest",
              variant === "cta" ? "text-white/80" : "text-brand-night-navy/50"
            )}
          >
            {title}
          </div>
          {primary && (
            <div
              className={cn(
                "mt-1 font-display font-black text-2xl md:text-3xl tracking-tight",
                variant === "cta" ? "text-white" : "text-brand-night-navy"
              )}
            >
              {primary}
            </div>
          )}
          {secondary && (
            <div
              className={cn(
                "mt-1 text-xs",
                variant === "cta" ? "text-white/80" : "text-brand-night-navy/60"
              )}
            >
              {secondary}
            </div>
          )}
        </div>
        <div
          className={cn(
            "text-2xl shrink-0",
            variant === "cta" ? "opacity-90" : "opacity-80"
          )}
          aria-hidden
        >
          {icon}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {href && (
        <div
          className={cn(
            "mt-4 inline-flex items-center text-xs font-semibold transition-transform group-hover:translate-x-0.5",
            variant === "cta" ? "text-white" : "text-accent"
          )}
        >
          {variant === "cta" ? "Los geht's →" : "Öffnen →"}
        </div>
      )}
    </Tag>
  );
}
```

- [ ] **Step 1.3: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "sheet\.tsx|dashboard-tile" | head -5
```

Expected: empty.

- [ ] **Step 1.4: Commit**

```bash
git add components/ui/sheet.tsx components/shared/dashboard-tile.tsx package.json package-lock.json
git commit -m "$(cat <<'EOF'
feat(ui): install shadcn Sheet + add DashboardTile primitive

Sheet (Radix Dialog wrapper) backs the new mobile sub-nav drawer in Task 2. DashboardTile is the reusable surface for both Vereins- and Sponsor-Dashboard tile grids (Tasks 3 + 4) — single primitive, two variants (default / cta), optional href makes the whole tile a link.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: VereinSubNav — mobile burger drawer

**Files:**
- Modify: `app/(verein)/verein/[slug]/_components/verein-sub-nav.tsx`

The current sub-nav is "use client" already. Extend it: on `md+` it renders the existing horizontal tabs (without the `overflow-x-auto` + `no-scrollbar` hack — since 6 tabs fit on md), on `<md` it renders a single burger button that opens a Sheet drawer containing all six tab links.

- [ ] **Step 2.1: Rewrite `verein-sub-nav.tsx`**

Replace the entire file with:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

const TABS = [
  { label: "Dashboard", href: "", emoji: "🏟️" },
  { label: "Ereignisse", href: "/ereignisse", emoji: "⚽" },
  { label: "Sponsoren", href: "/sponsoren", emoji: "💚" },
  { label: "Abrechnungen", href: "/abrechnungen", emoji: "📄" },
  { label: "Abo", href: "/abo", emoji: "💎" },
  { label: "Einstellungen", href: "/einstellungen", emoji: "⚙️" }
];

export function VereinSubNav({ slug, clubName }: { slug: string; clubName: string }) {
  const pathname = usePathname();
  const base = `/verein/${slug}`;
  const [open, setOpen] = useState(false);

  const activeTab = TABS.find(({ href }) => {
    const fullHref = `${base}${href}`;
    if (href === "") return pathname === base;
    return pathname === fullHref || pathname.startsWith(fullHref + "/");
  });

  return (
    <>
      {/* Desktop: horizontal tabs */}
      <nav className="hidden md:flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5">
        {TABS.map(({ label, href }) => {
          const fullHref = `${base}${href}`;
          const isActive = activeTab?.href === href;
          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-sm ring-1 ring-brand-neutral/20"
                  : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: burger trigger + drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="md:hidden flex items-center justify-between gap-3 w-full rounded-2xl border border-brand-neutral/40 bg-white px-4 py-3 text-left"
            aria-label="Vereins-Menü öffnen"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Menu className="h-5 w-5 text-brand-night-navy/60 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                  {clubName}
                </span>
                <span className="block text-sm font-semibold text-brand-night-navy truncate">
                  {activeTab?.label ?? "Dashboard"}
                </span>
              </span>
            </span>
            <span className="text-brand-night-navy/40 text-xs" aria-hidden>▾</span>
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[85%] sm:w-[380px] bg-white">
          <SheetHeader>
            <SheetTitle className="text-left">
              <span className="block text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                Verein
              </span>
              <span className="block font-display font-black text-xl tracking-tight text-brand-night-navy">
                {clubName}
              </span>
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            {TABS.map(({ label, href, emoji }) => {
              const fullHref = `${base}${href}`;
              const isActive = activeTab?.href === href;
              return (
                <Link
                  key={href}
                  href={fullHref}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent-dark"
                      : "text-brand-night-navy hover:bg-brand-off-white"
                  )}
                >
                  <span className="text-xl" aria-hidden>{emoji}</span>
                  {label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
```

`lucide-react` is already a dependency (most shadcn projects pull it in via shadcn add). If TypeScript complains about the Menu import, fall back to a unicode hamburger (`☰`) in a `<span>` to avoid blocking the build.

- [ ] **Step 2.2: Update the layout to pass `clubName`**

Open `app/(verein)/verein/[slug]/layout.tsx`. Find the `<VereinSubNav slug={slug} />` invocation. Change it to:

```tsx
<VereinSubNav slug={slug} clubName={club.name} />
```

The `club` variable is already in scope from `assertClubAccess`.

While in the layout, find the `<h1>` containing the club name (around the page header section, likely a `font-display font-black text-2xl md:text-4xl`). Wrap it in a `hidden md:block` div so mobile doesn't show the title twice (the burger trigger already shows it):

```tsx
<div className="hidden md:block">
  <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
    Vereins-Dashboard
  </p>
  <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
    {club.name}
  </h1>
</div>
```

If the current layout structure differs (e.g., the eyebrow and h1 are separate elements), apply `hidden md:block` to BOTH so they hide together on mobile.

- [ ] **Step 2.3: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "verein-sub-nav|verein/\[slug\]/layout" | head -5
```

Expected: empty.

- [ ] **Step 2.4: Commit**

```bash
git add app/\(verein\)/verein/\[slug\]/_components/verein-sub-nav.tsx app/\(verein\)/verein/\[slug\]/layout.tsx
git commit -m "$(cat <<'EOF'
feat(verein): mobile burger drawer for sub-nav

Sub-Nav is now responsive: md+ keeps the horizontal tab bar (no overflow-scroll needed at that width), <md renders a single burger trigger showing club name + active tab; tap opens a Sheet drawer with all 6 sections as emoji+label rows. Mobile also hides the layout-level h1 since the burger trigger already shows the club name — no more redundant double-title.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Verein-Dashboard tile reorg

**Files:**
- Modify: `app/(verein)/verein/[slug]/page.tsx`

The current page is 285 LOC of KPI cards + Mannschaften list + Pledges + Charges + Quick Actions. Rewrite as a tile grid that links each domain to its existing sub-page.

- [ ] **Step 3.1: Inspect the current page**

Run:

```bash
head -40 app/\(verein\)/verein/\[slug\]/page.tsx
```

Note the imports, query helpers used, and the assertClubAccess pattern. The rewrite KEEPS the data-loading queries (we still need stats for the tiles) but replaces the JSX block.

- [ ] **Step 3.2: Rewrite the page**

Replace `app/(verein)/verein/[slug]/page.tsx` with:

```tsx
import { eq, sql, and, gte } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { charges } from "@/lib/db/schema/charges";
import { pledges } from "@/lib/db/schema/pledges";
import { matches } from "@/lib/db/schema/matches";
import { DashboardTile } from "@/components/shared/dashboard-tile";

export const metadata = { title: "Dashboard · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function VereinDashboard({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "viewer");

  // Month-start in UTC for "this month" stats
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  // 7-day window for "diese Woche"
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    teamRows,
    activePledgeCount,
    weeklyChargeCents,
    monthlyChargeCents,
    recentMatchCount
  ] = await Promise.all([
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(and(eq(teams.clubId, club.id), eq(teams.isActive, true))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pledges)
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), eq(pledges.status, "active")))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), gte(charges.createdAt, weekStart)))
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .innerJoin(teams, eq(pledges.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), gte(charges.createdAt, monthStart)))
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(matches)
      .innerJoin(teams, eq(matches.teamId, teams.id))
      .where(and(eq(teams.clubId, club.id), gte(matches.datum, weekStart)))
      .then((r) => Number(r[0]?.n ?? 0))
  ]);

  const firstTeamId = teamRows[0]?.id ?? null;
  const teamCount = teamRows.length;

  return (
    <div className="grid gap-3 md:gap-4 md:grid-cols-2">
      <DashboardTile
        icon="🏆"
        title="Diese Woche"
        primary={eur(weeklyChargeCents)}
        secondary={`${recentMatchCount} Spiel${recentMatchCount === 1 ? "" : "e"} · ${eur(monthlyChargeCents)} diesen Monat`}
        href={`/verein/${slug}/abrechnungen`}
      />

      <DashboardTile
        icon="⚽"
        title="Mannschaften"
        primary={String(teamCount)}
        secondary={
          teamCount === 0
            ? "Noch keine Mannschaft angelegt"
            : teamRows
                .slice(0, 3)
                .map((t) => t.name)
                .join(" · ") + (teamCount > 3 ? ` · +${teamCount - 3}` : "")
        }
        href={firstTeamId ? `/verein/${slug}/mannschaft/${firstTeamId}` : `/verein/${slug}/einstellungen`}
      />

      <DashboardTile
        icon="💚"
        title="Aktive Sponsoren"
        primary={String(activePledgeCount)}
        secondary={
          activePledgeCount === 0
            ? "Noch keine Pledges aktiv"
            : "Tippen für die volle Sponsoren-Liste"
        }
        href={`/verein/${slug}/sponsoren`}
      />

      <DashboardTile
        icon="📄"
        title="Letzte Abrechnungen"
        primary={eur(monthlyChargeCents)}
        secondary="Diesen Monat erfasst"
        href={`/verein/${slug}/abrechnungen`}
      />

      <DashboardTile
        icon="🤝"
        title="Einladungslink teilen"
        primary="Sponsoren werben"
        secondary="WhatsApp · Mail · Stammtisch — Sponsoren legen Pledges selbst fest"
        href={`/verein/${slug}/sponsoren`}
        variant="cta"
        className="md:col-span-2"
      />
    </div>
  );
}
```

Note: this rewrite simplifies the dashboard significantly. The detailed Mannschaftsliste with per-team stats moves to its sub-page (or stays inline for now if `/verein/{slug}/mannschaften` doesn't exist — first-team-href fallback handles that gracefully).

If existing imports in the file (such as `seasonResults`, `getMatchChargesSummaryForTeam`, etc.) become unused after the rewrite, remove them. Don't leave dead imports.

- [ ] **Step 3.3: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "verein/\[slug\]/page" | head -5
```

Expected: empty.

If you see "column does not exist" errors (e.g., `charges.createdAt` named differently in schema), read the actual schema file and adjust the query. Don't add `as any`.

- [ ] **Step 3.4: Commit**

```bash
git add app/\(verein\)/verein/\[slug\]/page.tsx
git commit -m "$(cat <<'EOF'
refactor(verein): tile-based dashboard

Replace the multi-section ad-hoc dashboard with a five-tile grid (Diese Woche, Mannschaften, Aktive Sponsoren, Letzte Abrechnungen, CTA Einladungslink). Single Promise.all for the five aggregate queries, UTC month boundary, mobile-stack & desktop-2col layout. Detailed lists move to their sub-pages — dashboard becomes a glanceable jump-pad.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Sponsor-Dashboard tile reorg

**Files:**
- Modify: `app/(sponsor)/sponsor/page.tsx`

- [ ] **Step 4.1: Inspect the current page**

Run:

```bash
head -50 app/\(sponsor\)/sponsor/page.tsx
```

Same idea: keep auth + data, replace JSX.

- [ ] **Step 4.2: Rewrite the page**

Replace `app/(sponsor)/sponsor/page.tsx` with:

```tsx
import Link from "next/link";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors } from "@/lib/db/schema";
import { pledges } from "@/lib/db/schema/pledges";
import { charges } from "@/lib/db/schema/charges";
import { DashboardTile } from "@/components/shared/dashboard-tile";

export const metadata = { title: "Sponsor · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function SponsorDashboard() {
  const user = await requireUser();

  const [sponsorRow] = await db
    .select({ id: sponsors.id, displayName: sponsors.displayName, type: sponsors.type })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  // Empty state: no sponsor profile yet
  if (!sponsorRow) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center space-y-4">
        <div className="text-5xl">💚</div>
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Bereit, Mannschaften zu sponsern?
        </h1>
        <p className="text-sm text-brand-night-navy/60">
          Öffne den Einladungslink, den dir eine Mannschaft geschickt hat — oder entdecke
          Mannschaften, die nach Sponsoren suchen.
        </p>
        <Link
          href="/sponsor/discover"
          className="inline-block rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-white hover:bg-accent-dark"
        >
          Mannschaften entdecken →
        </Link>
      </div>
    );
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [activePledgeCount, monthlyCents, biggestRecent] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(pledges)
      .where(and(eq(pledges.sponsorId, sponsorRow.id), eq(pledges.status, "active")))
      .then((r) => Number(r[0]?.n ?? 0)),
    db
      .select({ s: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(and(eq(pledges.sponsorId, sponsorRow.id), gte(charges.createdAt, monthStart)))
      .then((r) => Number(r[0]?.s ?? 0)),
    db
      .select({
        amountCents: charges.amountCents,
        triggerType: charges.triggerType,
        createdAt: charges.createdAt
      })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(eq(pledges.sponsorId, sponsorRow.id))
      .orderBy(desc(charges.amountCents))
      .limit(1)
      .then((r) => r[0] ?? null)
  ]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/40 mb-1">
          Sponsor
        </p>
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy break-words">
          {sponsorRow.displayName}
        </h1>
      </div>

      <div className="grid gap-3 md:gap-4 md:grid-cols-2">
        <DashboardTile
          icon="💸"
          title="Diesen Monat"
          primary={eur(monthlyCents)}
          secondary={
            monthlyCents === 0
              ? "Noch keine Spielereignisse erfasst"
              : "Summe aller Spielereignisse"
          }
          href="/sponsor/rechnungen"
        />

        <DashboardTile
          icon="🤝"
          title="Meine Pledges"
          primary={String(activePledgeCount)}
          secondary={
            activePledgeCount === 0
              ? "Noch keine aktiven Pledges"
              : "Tippen für Übersicht"
          }
          href="/sponsor/pledge"
        />

        {biggestRecent && biggestRecent.amountCents > 0 && (
          <DashboardTile
            icon="⭐"
            title="Geilster Moment"
            primary={eur(biggestRecent.amountCents)}
            secondary={`Trigger: ${biggestRecent.triggerType}`}
            className="md:col-span-2"
          />
        )}

        <DashboardTile
          icon="🔍"
          title="Neue Mannschaft entdecken"
          primary="Mannschaften finden"
          secondary="Lokale Vereine, die offen sind für Sponsoren"
          href="/sponsor/discover"
          variant="cta"
          className="md:col-span-2"
        />
      </div>
    </div>
  );
}
```

If the existing page imports/queries differ, adapt rather than blindly replacing — the goal is to use `DashboardTile` for the surface and keep the auth-gate (`requireUser` + sponsor-lookup) consistent. Don't break the empty-state for users without a sponsor profile.

- [ ] **Step 4.3: TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | grep -E "\(sponsor\)/sponsor/page" | head -5
```

Expected: empty. If `charges.triggerType` doesn't exist as a column, drop that field from the biggest-recent display and use `eur(amountCents)` alone.

- [ ] **Step 4.4: Commit**

```bash
git add app/\(sponsor\)/sponsor/page.tsx
git commit -m "$(cat <<'EOF'
refactor(sponsor): tile-based dashboard

Sponsor-Dashboard mirrors the Verein tile pattern: Diesen Monat / Meine Pledges / Geilster Moment / Entdecken (CTA). Empty state for users without a sponsor profile keeps the "Mannschaften entdecken"-CTA front-and-center. Same DashboardTile primitive as the Verein-Dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final check + push

- [ ] **Step 5.1: Full TypeScript check**

Run:

```bash
npx tsc --noEmit 2>&1 | tail -15
```

Expected: clean for Phase D files. Pre-existing unrelated errors (debug scripts) may remain.

- [ ] **Step 5.2: Run identity-system tests**

Run:

```bash
npx vitest run tests/lib/identity-routing.test.ts tests/lib/scope-team.test.ts tests/lib/user-identities.test.ts tests/lib/membership-requests.test.ts 2>&1 | tail -10
```

Expected: 43+ passed (Phase A 17 + B 17 + C 9 = 43 minimum). Phase D adds no tests.

- [ ] **Step 5.3: Push**

Run:

```bash
git push origin main 2>&1 | tail -5
```

Expected: `main -> main`.

- [ ] **Step 5.4: Verify sync**

Run:

```bash
git rev-list --left-right --count main...origin/main
```

Expected: `0 0`.

---

## Done Criteria

1. ✅ `components/ui/sheet.tsx` installed; `components/shared/dashboard-tile.tsx` exports the reusable tile.
2. ✅ `VereinSubNav` shows horizontal tabs on md+, burger trigger + Sheet drawer with all 6 sections on <md.
3. ✅ Mobile no longer renders the page-level `<h1>` (burger trigger shows it instead).
4. ✅ `/verein/{slug}` page renders 5 tiles, no horizontal scroll on mobile, all tiles link to focused sub-pages.
5. ✅ `/sponsor` page renders 4 tiles + same empty state for un-onboarded sponsors.
6. ✅ All 4 Phase D commits land on `origin/main`. Existing Phase A/B/C tests stay green.

Phase D closes the identity-system overhaul that started with the Brainstorming session. Multi-role users have a clean experience end-to-end: sign-in → smart-routing → identity-picker (or direct deep-link) → tile-dashboard → all sections reachable via burger.
