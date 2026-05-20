# KickPact Plan 3 — Match-UI + Manual Events + Approval-Inbox

> **For agentic workers:** Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verein-Admin/Trainer kann Match-Detail anschauen + Spezial-Events (Kopfballtor, Karten, etc.) nachpflegen. Sponsor sieht eine Approval-Inbox mit pending Events, kann bestätigen oder bestreiten. Reminder-Cron erinnert Sponsoren an unbearbeitete Approvals.

**Architecture:** Server Components für Read-Views (Match-Detail, Sponsor-Inbox), Client Components für Editor/Actions, Server Actions für DB-Mutationen. Inngest-Reminder-Job für unbearbeitete Approvals. Tenant-Isolation via `assertClubAccess` (Verein) + `sponsor.user_id` (Sponsor).

**Tech Stack:** Bestehend — Next.js 15, Drizzle, shadcn/ui, Inngest. Keine neuen Dependencies.

**Spec:** [../specs/2026-05-19-kickpact-v1-design.md](../specs/2026-05-19-kickpact-v1-design.md) — Sections 6.5, 6.6, 5.4 (Approval-Lifecycle), 8.1 Routes.

**Prerequisites:** Plan 2 gemerged auf main. Tabellen `matches`, `match_events`, `event_approvals`, `charges` aus Plan 1 existieren. Trigger-Engine + Inngest-Pipeline läuft.

---

## File Structure (Neu/Modifiziert)

```
app/
├── (verein)/verein/[slug]/
│   ├── mannschaft/[teamId]/page.tsx          NEW — Team-Detail mit Spiele-Liste
│   ├── spiel/[matchId]/
│   │   ├── page.tsx                          NEW — Match-Detail mit Events
│   │   └── _components/
│   │       ├── match-events-list.tsx         NEW — Read-only Event-Display
│   │       └── manual-event-editor.tsx       NEW — Dialog mit Form
│   ├── sponsoren/page.tsx                    NEW — Sponsor-Liste mit Invitations
│   └── abrechnungen/page.tsx                 NEW — Stub bis Plan 4
├── (sponsor)/sponsor/
│   ├── inbox/
│   │   ├── page.tsx                          NEW — Pending Approvals
│   │   └── _components/approval-row.tsx      NEW — Approve/Dispute Buttons
│   └── rechnungen/page.tsx                   NEW — Stub bis Plan 4

lib/
├── actions/
│   ├── match-events.ts                       NEW — addManualEvent server action
│   └── approvals.ts                          NEW — confirmApproval / disputeApproval
├── db/queries/
│   ├── matches.ts                            NEW — getMatch, listMatchEvents, etc.
│   ├── approvals.ts                          NEW — listPendingForSponsor, count
│   └── sponsors.ts                           NEW — listForClub
└── inngest/functions/
    └── approval-reminders.ts                 NEW — täglicher cron, mailt pending

tests/
└── e2e/match-ui.spec.ts                      NEW — Manual Event + Approval flow
```

## Phase Overview

- **Phase A** — Match-Detail Read-View (Tasks 1–3)
- **Phase B** — Manual Event Editor (Tasks 4–6)
- **Phase C** — Sponsor Approval Inbox (Tasks 7–9)
- **Phase D** — Verein-Side-Routes (Tasks 10–12)
- **Phase E** — Reminder-Cron + E2E (Tasks 13–14)

---

## Phase A — Match-Detail Read-View

### Task 1: DB-Queries `lib/db/queries/matches.ts`

**Files:** Create `lib/db/queries/matches.ts`

- [ ] Implement:
  - `getMatchById(matchId, clubSlug)` — joins matches+teams+clubs, checks club ownership, returns match with team info
  - `listMatchEvents(matchId)` — alle events für match, sortiert by minute
  - `listMatchesForTeam(teamId, limit=20)` — recent matches with ergebnis

Code:

```typescript
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, clubs } from "@/lib/db/schema";

export async function getMatchById(matchId: string, clubSlug: string) {
  const [row] = await db
    .select({
      match: matches,
      team: teams,
      club: clubs
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(eq(matches.id, matchId), eq(clubs.slug, clubSlug)))
    .limit(1);
  return row ?? null;
}

export async function listMatchEvents(matchId: string) {
  return db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(matchEvents.minute);
}

export async function listMatchesForTeam(teamId: string, limit = 20) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.teamId, teamId))
    .orderBy(desc(matches.datum))
    .limit(limit);
}
```

- [ ] Type-check + commit.

### Task 2: Match-Detail Page `app/(verein)/verein/[slug]/spiel/[matchId]/page.tsx`

- [ ] Use `assertClubAccess(slug, "viewer")` for guard.
- [ ] Load match + events via Task 1's queries.
- [ ] Render: Match-Header (Heim 3:1 Gast, Datum, HZ), Event-Timeline (component from Task 3), Link "Spezial-Event hinzufügen" → öffnet Editor (Task 4).
- [ ] Brand styling.

### Task 3: Event-Timeline Component `match-events-list.tsx`

- [ ] Server Component. Renders events sortiert by minute. Tor = ⚽, Karte = 🟨/🟥, Spezial = 🎭, Auswechslung = 🔄.
- [ ] Visual: Tor heim links / gast rechts (geteilte Spalten).
- [ ] Manual-flag (Verein-gemeldet) visuell markieren (kleine Badge).

---

## Phase B — Manual Event Editor

### Task 4: Server Action `lib/actions/match-events.ts`

**Files:** Create `lib/actions/match-events.ts`

- [ ] `addManualEvent(input: { matchId, minute, type, subtype?, side, playerName?, playerId? })`:
  - assertClubAccess via match->team->club lookup, role >= trainer
  - Insert match_event with source=manual + reported_by_user_id
  - Trigger Inngest `match/event-added` event (für später; Plan 1's evaluate-match-event job ist nicht vorhanden, daher: für Plan 3 v1 reicht es event nur zu inserten + die Charges werden in Plan 4 batch-erzeugt; ODER inline Trigger-Engine evaluate für nur dieses Event)
  - Für v1: nur inserten. evaluate kommt in einem Follow-up (siehe Task 6).

### Task 5: Manual Event Editor Component `manual-event-editor.tsx`

- [ ] Client Component, shadcn Dialog
- [ ] Form mit react-hook-form: type (Select: special_goal | yellow_card | red_card | assist), subtype (kontextuell), minute (number), side (Radio heim/gast), playerName (Input)
- [ ] Submit → addManualEvent action → router.refresh
- [ ] Toast bei Erfolg

### Task 6: Inline Trigger-Engine Evaluation für neue Events

- [ ] Erweitere `addManualEvent` Action: nach Insert
  - Lade alle aktiven pledge_rules für das team
  - Bau MatchInput, rufe evaluateTriggers auf
  - Filter nur Proposals für DIESES Event (matchEventId == new event id)
  - Insert als charges mit status=pending_approval + erstelle event_approvals (eine pro pledge_rule die matched)
  - Atomare Transaction

---

## Phase C — Sponsor Approval Inbox

### Task 7: DB-Queries `lib/db/queries/approvals.ts`

- [ ] `listPendingForSponsor(userId)`: joins event_approvals + match_events + matches + teams + clubs + pledges + pledge_rules + sponsors WHERE sponsor.user_id=X AND status='pending'
- [ ] `countPendingForSponsor(userId)`: für Badge in Header
- [ ] `getApprovalForUpdate(approvalId, userId)`: scoped lookup

### Task 8: Inbox Page `app/(sponsor)/sponsor/inbox/page.tsx`

- [ ] Server Component, requireUser()
- [ ] Render Liste der pending approvals: Match-Bezeichnung, Event-Beschreibung (z.B. "Kopfballtor von Schmidt, 47. Minute"), Charge-Betrag, "Bestätigen" / "Bestreiten" Buttons
- [ ] Group by match if mehrere events.

### Task 9: Approval Server Actions `lib/actions/approvals.ts` + Approval-Row Component

- [ ] `confirmApproval(approvalId)`: set status=confirmed, set charges.status=confirmed + confirmed_at
- [ ] `disputeApproval(approvalId, reason?)`: set status=disputed, charges.status=cancelled, dispute_reason
- [ ] Client Component für Buttons mit Dialog für Dispute-Reason (optional)
- [ ] Update Header-Badge mit pending count

---

## Phase D — Verein-Side Routes

### Task 10: Sponsoren-Liste `app/(verein)/verein/[slug]/sponsoren/page.tsx`

- [ ] List existing invitations + sponsors who used them + their active pledges
- [ ] Button "Neue Einladung erstellen" (creates new sponsor_invitation, displays link)
- [ ] Revoke-Button für individual invitations

### Task 11: Team-Detail `app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx`

- [ ] List recent matches via `listMatchesForTeam` (Task 1)
- [ ] Each match links to `/verein/[slug]/spiel/[matchId]`
- [ ] Show team stats: total goals, win-rate, sponsor count

### Task 12: Stubs für Abrechnungen + Sponsor-Rechnungen

- [ ] `/verein/[slug]/abrechnungen/page.tsx` — Stub mit Hinweis "kommt in Plan 4"
- [ ] `/sponsor/rechnungen/page.tsx` — Gleicher Stub

---

## Phase E — Reminder-Cron + E2E

### Task 13: Inngest Reminder-Cron

- [ ] `lib/inngest/functions/approval-reminders.ts`
- [ ] Cron `0 9 * * *` (täglich 9 Uhr)
- [ ] Query: pending approvals älter als 7d, 14d, 30d, dann monatlich
- [ ] Per Sponsor 1 Mail mit Liste der pending events + Link zur Inbox
- [ ] Update event_approvals.reminder_count + last_reminded_at

### Task 14: E2E Test

- [ ] `tests/e2e/match-ui.spec.ts`
- [ ] Test 1: Verein-Admin öffnet Match-Detail, sieht Events
- [ ] Test 2: Verein-Admin fügt Manual Event hinzu, erscheint in Liste
- [ ] Test 3: Inbox-Stub (ohne Login: redirected to /login)

---

## Plan Self-Review

- ✅ Section 6.5 (Manual Events) — Tasks 4-6
- ✅ Section 6.6 (Approval) — Tasks 7-9, 13
- ✅ Section 5.4 (Reminder-Cadence) — Task 13
- ✅ Section 8.1 verein-Routes — Tasks 2, 10, 11, 12
- ✅ Section 8.1 sponsor-Routes — Tasks 8, 12

**Known limits for follow-up plans:**
- PDF-Render für Sponsor-Rechnung = Plan 4
- Email-Templates für Approvals = ggf. ausarbeiten in Task 13
- Live-Match-Push für Mobile = Plan 6+

## Execution Handoff

Plan ready. Subagent-Driven Execution empfohlen — 14 Tasks, ~3 Wochen wenn man's wall-clock-mässig macht. Per Cron-Iteration ~2 Tasks.
