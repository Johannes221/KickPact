# Desktop-Glocke für Benachrichtigungen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing `NotificationsBell` (icon + unread badge + notification list) visible on desktop, not just mobile/iOS, in the Verein-, Mannschaft- and Sponsor-Bereich.

**Architecture:** `NotificationsBell` gets a new `placement?: "mobile" | "desktop"` prop (default `"mobile"`, so every existing call site is unaffected). `placement="desktop"` changes only the trigger button's visibility classes (`hidden md:grid` instead of unconditional) and the notification panel's `Sheet` side (`"right"` off-canvas panel instead of `"bottom"` sheet). A second `<NotificationsBell placement="desktop" />` instance is added next to the desktop tab strip in the three sub-nav components that already render the mobile bell inside `AppNavBar`.

**Tech Stack:** Next.js 15 App Router, React Client Components, Tailwind v3.4, shadcn/ui `Sheet` (Radix Dialog primitive, already installed — no new dependency).

**Spec:** [docs/superpowers/specs/2026-07-20-desktop-notifications-bell-design.md](../specs/2026-07-20-desktop-notifications-bell-design.md)

---

### Task 1: `NotificationsBell` — `placement` prop, dynamic Sheet side, focus-visible state

**Files:**
- Modify: `components/shared/notifications-bell.tsx`

- [ ] **Step 1: Add the `placement` prop and switch the trigger button's classes**

In `components/shared/notifications-bell.tsx`, find the `NotificationsBell` function (starts at the doc-comment above `export function NotificationsBell()`):

```tsx
export function NotificationsBell() {
  const statusItems = useStatusItems();
```

Replace with:

```tsx
interface NotificationsBellProps {
  /** "mobile" (Default) = Glocke in der nativen AppNavBar, Bottom-Sheet.
   *  "desktop" = Glocke in der Desktop-Tab-Leiste, rechtsseitiges Panel. */
  placement?: "mobile" | "desktop";
}

export function NotificationsBell({ placement = "mobile" }: NotificationsBellProps) {
  const statusItems = useStatusItems();
```

Then find the trigger `<button>` further down:

```tsx
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label={badge > 0 ? `Benachrichtigungen (${badge})` : "Benachrichtigungen"}
        className="relative -ml-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full text-accent transition-colors active:bg-brand-off-white"
      >
```

Replace with:

```tsx
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label={badge > 0 ? `Benachrichtigungen (${badge})` : "Benachrichtigungen"}
        className={cn(
          "relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          placement === "desktop"
            ? "hidden md:grid hover:bg-brand-off-white"
            : "-ml-0.5 active:bg-brand-off-white"
        )}
      >
```

Then find the `<NotificationsSheet>` call right below the button's closing tag:

```tsx
      <NotificationsSheet
        open={open}
        onOpenChange={handleOpenChange}
        statusItems={statusItems}
        notifs={notifs}
      />
```

Replace with:

```tsx
      <NotificationsSheet
        open={open}
        onOpenChange={handleOpenChange}
        statusItems={statusItems}
        notifs={notifs}
        side={placement === "desktop" ? "right" : "bottom"}
      />
```

- [ ] **Step 2: Make `NotificationsSheet` accept the `side` and render both panel styles**

Find:

```tsx
function NotificationsSheet({
  open,
  onOpenChange,
  statusItems,
  notifs
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  statusItems: StatusItem[];
  notifs: Notif[];
}) {
  const empty = statusItems.length === 0 && notifs.length === 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="native-font max-h-[88vh] overflow-y-auto rounded-t-3xl border-brand-neutral/30 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-brand-neutral/40" aria-hidden />
        <SheetHeader className="px-1">
```

Replace with:

```tsx
function NotificationsSheet({
  open,
  onOpenChange,
  statusItems,
  notifs,
  side
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  statusItems: StatusItem[];
  notifs: Notif[];
  side: "bottom" | "right";
}) {
  const empty = statusItems.length === 0 && notifs.length === 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          "native-font overflow-y-auto border-brand-neutral/30 bg-white",
          side === "bottom"
            ? "max-h-[88vh] rounded-t-3xl px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
            : "px-5 pt-6 pb-6"
        )}
      >
        {side === "bottom" ? (
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-brand-neutral/40" aria-hidden />
        ) : null}
        <SheetHeader className="px-1">
```

Everything else inside `NotificationsSheet` (the `SheetTitle`, the empty state, the `statusItems`/`notifs` sections) stays unchanged — only the opening `SheetContent` block and the drag-handle `div` change.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (in particular no complaints about the new `placement`/`side` props being unused or mistyped).

- [ ] **Step 4: Commit**

```bash
git add components/shared/notifications-bell.tsx
git commit -m "$(cat <<'EOF'
feat(notifications): NotificationsBell unterstützt Desktop-Placement

placement="desktop" schaltet die Glocke sichtbar (statt md:hidden) und
zeigt das Panel als rechtsseitiges Sheet statt Bottom-Sheet. Bestehende
mobile Aufrufstellen bleiben unverändert (Default "mobile").
EOF
)"
```

---

### Task 2: Desktop-Glocke im Verein-Bereich

**Files:**
- Modify: `app/(verein)/verein/[slug]/_components/verein-sub-nav.tsx`

- [ ] **Step 1: Import `NotificationsBell`**

Find the import block at the top of the file:

```tsx
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import type { SettingsNavItem } from "@/components/shared/settings-sheet";
```

Replace with:

```tsx
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import { NotificationsBell } from "@/components/shared/notifications-bell";
import type { SettingsNavItem } from "@/components/shared/settings-sheet";
```

- [ ] **Step 2: Wrap the desktop tab strip with the bell**

Find:

```tsx
      {/* Desktop: horizontale Tab-Leiste (alle Tabs) */}
      <nav className="hidden md:flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 overflow-x-auto">
        {ALL_TABS.map(({ label, href }) => {
          const fullHref = `${base}${href}`;
          const isActive = activeTab?.href === href;
          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-ios-card ring-1 ring-brand-neutral/20"
                  : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
```

Replace with:

```tsx
      {/* Desktop: horizontale Tab-Leiste (alle Tabs) + Benachrichtigungs-Glocke */}
      <div className="hidden md:flex items-center gap-2">
        <nav className="flex min-w-0 flex-1 gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 overflow-x-auto">
          {ALL_TABS.map(({ label, href }) => {
            const fullHref = `${base}${href}`;
            const isActive = activeTab?.href === href;
            return (
              <Link
                key={href}
                href={fullHref}
                className={cn(
                  "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                  isActive
                    ? "bg-white text-brand-night-navy shadow-ios-card ring-1 ring-brand-neutral/20"
                    : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <NotificationsBell placement="desktop" />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(verein)/verein/[slug]/_components/verein-sub-nav.tsx"
git commit -m "$(cat <<'EOF'
feat(notifications): Desktop-Glocke im Verein-Bereich

EOF
)"
```

---

### Task 3: Desktop-Glocke im Mannschafts-Bereich

**Files:**
- Modify: `app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx`

- [ ] **Step 1: Import `NotificationsBell`**

Find:

```tsx
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import type { SettingsNavItem } from "@/components/shared/settings-sheet";
import type { EffectivePlan } from "@/lib/db/queries/user-identities";
```

Replace with:

```tsx
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import { NotificationsBell } from "@/components/shared/notifications-bell";
import type { SettingsNavItem } from "@/components/shared/settings-sheet";
import type { EffectivePlan } from "@/lib/db/queries/user-identities";
```

- [ ] **Step 2: Wrap the desktop tab strip with the bell**

Find:

```tsx
      {/* Desktop: horizontale Tab-Leiste (alle Tabs) */}
      <nav className="hidden md:flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 overflow-x-auto">
        {allTabs.map(({ label, href }) => {
          const fullHref = `${base}${href}`;
          const isActive = activeTab?.href === href;
          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-ios-card ring-1 ring-brand-neutral/20"
                  : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
```

Replace with:

```tsx
      {/* Desktop: horizontale Tab-Leiste (alle Tabs) + Benachrichtigungs-Glocke */}
      <div className="hidden md:flex items-center gap-2">
        <nav className="flex min-w-0 flex-1 gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 overflow-x-auto">
          {allTabs.map(({ label, href }) => {
            const fullHref = `${base}${href}`;
            const isActive = activeTab?.href === href;
            return (
              <Link
                key={href}
                href={fullHref}
                className={cn(
                  "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                  isActive
                    ? "bg-white text-brand-night-navy shadow-ios-card ring-1 ring-brand-neutral/20"
                    : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <NotificationsBell placement="desktop" />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav.tsx"
git commit -m "$(cat <<'EOF'
feat(notifications): Desktop-Glocke im Mannschafts-Bereich

EOF
)"
```

---

### Task 4: Desktop-Glocke im Sponsor-Bereich

**Files:**
- Modify: `app/(sponsor)/sponsor/_components/sponsor-sub-nav.tsx`

- [ ] **Step 1: Import `NotificationsBell`**

Find:

```tsx
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import type { SettingsNavItem } from "@/components/shared/settings-sheet";
```

Replace with:

```tsx
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import { NotificationsBell } from "@/components/shared/notifications-bell";
import type { SettingsNavItem } from "@/components/shared/settings-sheet";
```

- [ ] **Step 2: Wrap the desktop tab strip with the bell**

Find:

```tsx
      {/* Desktop: horizontaler Tab-Streifen (alle Tabs) */}
      <nav className="hidden md:flex gap-0.5 overflow-x-auto rounded-xl bg-brand-night-navy/5 p-1 no-scrollbar">
        {ALL_TABS.map(({ label, href }) => {
          const isActive = activeTab?.href === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-ios-card"
                  : "text-brand-night-navy/50 hover:text-brand-night-navy hover:bg-white/60"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
```

Replace with:

```tsx
      {/* Desktop: horizontaler Tab-Streifen (alle Tabs) + Benachrichtigungs-Glocke */}
      <div className="hidden md:flex items-center gap-2">
        <nav className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto rounded-xl bg-brand-night-navy/5 p-1 no-scrollbar">
          {ALL_TABS.map(({ label, href }) => {
            const isActive = activeTab?.href === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-white text-brand-night-navy shadow-ios-card"
                    : "text-brand-night-navy/50 hover:text-brand-night-navy hover:bg-white/60"
                )}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <NotificationsBell placement="desktop" />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(sponsor)/sponsor/_components/sponsor-sub-nav.tsx"
git commit -m "$(cat <<'EOF'
feat(notifications): Desktop-Glocke im Sponsor-Bereich

EOF
)"
```

---

## Manual Verification (Staging)

Kein lokaler Dev-Server (Projekt-Konvention: immer auf Staging via Push auf `main` verifizieren). Nach Deploy:

1. Als Club-Admin mit einem Zweit-Account eine Zugriffs-Anfrage für einen Test-Verein stellen.
2. Im Desktop-Browser als Club-Admin einloggen, zu `/verein/<slug>` navigieren.
3. Prüfen: die Glocke erscheint rechts neben der Tab-Leiste mit rotem Badge.
4. Klick auf die Glocke → Panel öffnet sich von rechts, zeigt die Zugriffs-Anfrage, Badge verschwindet.
5. Klick auf den Eintrag → Navigation zu `/verein/<slug>/einstellungen/mitglieder`, Panel schließt.
6. Gleiche Prüfung auf `/verein/<slug>/mannschaft/<teamId>` und `/sponsor` wiederholen (Bell + Panel erscheinen dort ebenfalls).
7. Fenster auf Mobile-Breite verkleinern (< 768px) → Desktop-Glocke verschwindet, mobile Glocke in der `AppNavBar` bleibt wie bisher sichtbar.
