# KickPact v1 — Completion Plan (2026-05-21)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle fehlenden Sub-Prozesse aus dem KickPact-Spec implementieren — Pledge-Setup, Analyse, Navigation, Einstellungen, Sponsor-Profil, Pause/Resume, Banners, E2E-Tests.

**Architecture:** Auf bestehendem Foundation-Plan aufbauend (Plan 2026-05-19). Alle Änderungen sind additive — keine bestehenden Tests brechen, TypeScript strict bleibt sauber.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, Better Auth, Inngest, Tailwind + shadcn/ui, Vitest + Playwright.

**Referenz-Spec:** [docs/superpowers/specs/2026-05-19-kickpact-v1-design.md](../specs/2026-05-19-kickpact-v1-design.md)

---

## Status: Implementiert in dieser Session (2026-05-21)

### ✅ Task 1: TypeScript-Fix Crawler

**Commit:** `69315e8`

- `lib/crawler/fussballde.ts`: `side: "heim" | "gast" | "unbekannt"` statt `side: string` im rawEvents-Cast  
- `lib/crawler/fussballde.ts`: `typ: ev.typ as "TOR" | "AUSWECHSLUNG"` Fallback-Cast

### ✅ Task 2: Pledge-Builder Trigger-Params + Cap-Warning

**Commit:** `9126f31`

**Files:**
- Modified: `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx`

- [ ] `goal_by_player` → `player_name` Input
- [ ] `goals_scored_min` → `min_goals` Number-Input (2–20)
- [ ] `goal_diff_min` → `min_diff` Number-Input (2–20)
- [ ] `season_table_position` → `min_pos` + `max_pos` Number-Inputs
- [ ] Monthly-Cap-Warning-Banner wenn kein Cap gesetzt und Rules > 0

**Test:** `npx tsc --noEmit` clean, `npm test` 65/65

### ✅ Task 3: Match/Spiel-Seiten Charge-Anzeige

**Commit:** `9126f31`

**Files:**
- Modified: `app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx`
- Modified: `app/(verein)/verein/[slug]/spiel/[matchId]/page.tsx`
- Modified: `app/(verein)/verein/[slug]/spiel/[matchId]/_components/match-events-list.tsx`
- Modified: `lib/db/queries/matches.ts`

- [ ] Mannschaft-Page: Saison-Stats-Grid (Spiele, S/U/N, Tore, Sponsor-€)
- [ ] Mannschaft-Page: farbige Match-Borders (grün/rot/amber)
- [ ] Spiel-Page: Sponsor-Charges-Section mit Trigger-Breakdown
- [ ] Match-Events-List: inline Charge-Chips pro Event
- [ ] Neue Query: `listMatchCharges(matchId)`, `getMatchChargesSummaryForTeam(teamId)`

### ✅ Task 4: Sponsor-UX + Einstellungen + Navigation

**Commit:** `4092974`

**Files:**
- Created: `app/(verein)/verein/[slug]/einstellungen/page.tsx`
- Created: `app/(verein)/verein/[slug]/einstellungen/_components/einstellungen-form.tsx`
- Created: `lib/actions/club-settings.ts`
- Created: `lib/actions/pledges.ts`
- Created: `app/(sponsor)/sponsor/pledge/[id]/_components/pledge-status-toggle.tsx`
- Modified: `app/(sponsor)/sponsor/_components/sponsor-sub-nav.tsx`
- Modified: `app/(sponsor)/sponsor/layout.tsx`
- Modified: `app/(sponsor)/sponsor/page.tsx`
- Modified: `app/(sponsor)/sponsor/pledge/[id]/page.tsx`
- Modified: `app/(verein)/verein/[slug]/_components/verein-sub-nav.tsx`
- Modified: `app/(verein)/verein/[slug]/layout.tsx`

**Einstellungen:**
- [ ] `/verein/[slug]/einstellungen` — Stammdaten, Adresse, §19/USt-ID, IBAN, Abo-Link
- [ ] `updateClubSettings` Server Action mit Drizzle-Update + `assertClubAccess("admin")`
- [ ] "Einstellungen"-Tab in Verein-Sub-Nav

**Sponsor-UX:**
- [ ] "Inbox"-Tab in Sponsor-Sub-Nav mit Pending-Count-Badge
- [ ] `countPendingForSponsor()` serverseitig im Sponsor-Layout geladen
- [ ] Pledge-Detail: echte Charge-History (letzte 10) statt Placeholder
- [ ] Pledge-Detail: `PledgeStatusToggle` Pause/Resume-Button
- [ ] `setPledgeStatus` Server Action mit Tenant-Check
- [ ] Sponsor-Dashboard: Quick-Navigation-Links statt Placeholder

**Subscription-Banners:**
- [ ] Trial-Countdown-Banner (≤14 Tage vor Ende) im Verein-Layout
- [ ] Bestehende past_due + read_only Banners bleiben erhalten

---

## Offene Tasks (noch zu implementieren)

### Task 5: Sponsor-Profil-Edit

**Status:** Agent läuft parallel

**Files:**
- Create: `app/(sponsor)/sponsor/profil/page.tsx`
- Create: `app/(sponsor)/sponsor/profil/_components/sponsor-profile-form.tsx`
- Create: `lib/actions/sponsor-profile.ts`
- Modify: `app/(sponsor)/sponsor/_components/sponsor-sub-nav.tsx` (Profil-Tab)

Sponsor kann nach Onboarding displayName, businessName, Adresse, USt-ID aktualisieren.

### Task 6: E2E Playwright Tests

**Status:** Agent läuft parallel

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/01-onboarding.spec.ts`
- Create: `tests/e2e/02-pledge-builder.spec.ts`
- Create: `tests/e2e/03-public-pages.spec.ts`

3 Spec-Anforderungen aus Abschnitt 10:
1. Smoke-Test: alle öffentlichen Seiten laden ohne 500
2. Auth-Guard: geschützte Routen redirecten zu Login
3. Pledge-Builder: UI rendert korrekt (ohne Token = Fehlermeldung)

**Ausführung:**
```bash
# Voraussetzung: laufende App auf localhost:3000
npm run dev &
npx playwright test
# oder
npm run test:e2e
```

---

## Architektur-Entscheidungen

### Trigger-Params Flow

Params fließen von `pledge_rules.trigger_params_json` → `triggers.ts` evaluateTriggers() → Charge-Erzeugung.

Eingabe im Pledge-Builder: `rules[i].params` als `Record<string, unknown>` — wird direkt in DB gespeichert. Die Trigger-Engine liest `rule.triggerParamsJson` und castet per-trigger.

### Subscription-Gate

`gateFromSubscription()` ist pure function (testbar ohne DB). Drei Zustände:
- `trialing`: Trial-Countdown-Banner ≤14 Tage vor Ende
- `past_due` (isReadOnly=false): Warning-Banner, 7-Tage Grace
- `past_due` (isReadOnly=true) + `cancelled`: Read-Only-Banner

### Pending-Count-Badge

`countPendingForSponsor(userId)` — Server-seitig im Layout geladen, als Prop an Client-Component `SponsorSubNav` weitergegeben. Bei 0 kein Badge. Bei >99 zeigt "99+".

---

## Test-Abdeckung (Stand 2026-05-21)

| Modul | Tests | Status |
|---|---|---|
| `lib/crawler/triggers.ts` | 31 | ✅ |
| `lib/db/queries/subscription-status.ts` | 12 | ✅ |
| `lib/inngest/functions/evaluate-season.ts` | 22 | ✅ |
| `lib/inngest/functions/evaluate-match.ts` | 2 | ⏭️ skip (RUN_DB_INTEGRATION) |
| `lib/crawler/fussballde.ts` | 4 | ⏭️ skip (RUN_CRAWLER_SMOKE) |
| E2E Playwright | 12+ | 🔄 hinzugefügt, braucht laufende App |

**Gesamt:** 65 Unit-Tests passing, 6 skipped (intentional), 0 Fehler
