# Phase 1: Sommerpause-Charge-Lücke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spiele, die zwischen 1.6. und 15.6. gescraped werden, erzeugen wieder Charges (Sommerpause-Pause darf legitime Saison-Spiele nicht unterdrücken) — plus die drei verwandten Status-Maschinen-Bugs und eine Reparatur der seit 1.6. verlorenen Juni-Charges.

**Architecture:** Neue Spalte `pledges.paused_at` unterscheidet manuelle Pause (Charges nur für Spiele VOR der Pause) von Sommerpause (`sommerpause_paused=true` → Charges für alle Spiele im Pledge-Fenster, das eh am 30.6. endet). `loadActivePledgeRulesForTeam` bekommt einen erweiterten Status-Filter. Reparatur via Re-Emit von `match/finished`-Events.

**Tech Stack:** Drizzle/Postgres, Inngest, Vitest gegen Test-DB (docker-compose, `tests/setup/integration-db`).

**Watch-Point:** Kein Wettbewerbs-Feld auf `matches` → Freundschaftsspiele 1.–15.6. im Pledge-Fenster würden charten. Akzeptiert (Crawler pausiert ab 16.6., Approval+Storno als Netz).

---

### Task 1: Schema `pledges.pausedAt` + Migration

**Files:**
- Modify: `lib/db/schema/pledges.ts:74` (neben `sommerpausePaused`)
- Generate: `drizzle/migrations/0053_*.sql` + `meta/_journal.json`

- [ ] **Step 1:** Spalte ergänzen:
```ts
sommerpausePaused: boolean("sommerpause_paused").notNull().default(false),
/**
 * Zeitpunkt der letzten manuellen Pause durch den Sponsor (NULL = nicht
 * manuell pausiert). Spiele mit datum < pausedAt werden weiter abgerechnet
 * (analog H4c für ended) — eine Pause nach Abpfiff, vor dem Scrape, darf
 * die Charge des gespielten Spiels nicht unterdrücken.
 * Sommerpause-Pausen setzen pausedAt NICHT (Erkennung via sommerpausePaused).
 */
pausedAt: timestamp("paused_at", { withTimezone: true }),
```
- [ ] **Step 2:** `npm run db:generate` → Migration 0053 entsteht.
- [ ] **Step 3:** **Journal-Bump (Memory-Falle!):** in `drizzle/migrations/meta/_journal.json` das `when` des neuen Eintrags auf `> 1782361800000` setzen (z.B. `1782400000000`) — sonst when-Skip-Falle bei Parallel-Branches.
- [ ] **Step 4:** Commit `feat(schema): pledges.paused_at für faire Pause-Semantik`.

### Task 2: `loadActivePledgeRulesForTeam` bedient Sommerpause- und Vor-Pause-Spiele (TDD)

**Files:**
- Test: `tests/queries/evaluation-paused-pledges.test.ts` (neu, Pattern von `tests/scraper/integration/evaluate-match.test.ts` + `seedSponsorWithPledge`-Fixture)
- Modify: `lib/db/queries/evaluation.ts:33-62`

- [ ] **Step 1: Fehlschlagende Tests** — drei Fälle:
```ts
it("liefert Rules für sommerpause-pausierte Pledges (Spiel im Fenster)", async () => {
  // pledge: status=paused, sommerpausePaused=true, Fenster [2025-08-01, 2026-06-30]
  const rules = await loadActivePledgeRulesForTeam(teamId, new Date("2026-06-07T15:00:00Z"));
  expect(rules).toHaveLength(1);
});
it("liefert Rules für manuell pausierte Pledges, wenn das Spiel VOR der Pause lag", async () => {
  // pledge: status=paused, sommerpausePaused=false, pausedAt=2026-06-06
  const rules = await loadActivePledgeRulesForTeam(teamId, new Date("2026-06-05T15:00:00Z"));
  expect(rules).toHaveLength(1);
});
it("liefert KEINE Rules für manuell pausierte Pledges bei Spielen NACH der Pause", async () => {
  const rules = await loadActivePledgeRulesForTeam(teamId, new Date("2026-06-07T15:00:00Z"));
  expect(rules).toHaveLength(0);
});
```
- [ ] **Step 2:** `npm test -- tests/queries/evaluation-paused-pledges.test.ts` → 2 von 3 FAIL (Fall 3 passt schon, als Regressions-Anker behalten).
- [ ] **Step 3: Fix** — Status-Filter ersetzen (`or` importieren):
```ts
or(
  inArray(pledges.status, ["active", "ended"]),
  and(
    eq(pledges.status, "paused"),
    or(
      eq(pledges.sommerpausePaused, true),
      sql`${pledges.pausedAt} IS NOT NULL AND ${pledges.pausedAt} > ${asOf.toISOString()}`
    )
  )
)
```
Kommentar H4c entsprechend korrigieren („paused bleibt ausgeschlossen" ist falsch).
- [ ] **Step 4:** Tests grün + bestehende Suite `npm test -- tests/queries tests/scraper/integration/evaluate-match.test.ts` grün.
- [ ] **Step 5:** Commit `fix(billing): Sommerpause/Pause unterdrückt keine gespielten Spiele mehr`.

### Task 3: Status-Übergänge reparieren (Flag-Reset, pausedAt, Cron) (TDD)

**Files:**
- Test: `tests/actions/pledge-status-transitions.test.ts` (Pattern bestehender Action-Tests prüfen; sonst DB-Level-Test der Update-Logik)
- Modify: `lib/actions/pledges.ts:106-137` (setPledgeStatus)
- Modify: `lib/inngest/functions/pause-pledges-sommerpause.ts:26` (Cron setzt KEIN pausedAt — nur Flag; verifizieren per Test)
- Modify: `lib/inngest/functions/resume-pledges-sommerpause.ts` (Resume muss `sommerpausePaused=false` setzen — lesen + verifizieren)

- [ ] **Step 1: Fehlschlagende Tests:** (a) pause → `pausedAt` gesetzt; (b) activate nach Sommerpause → `sommerpausePaused=false` UND `pausedAt=null`; (c) activate nach manueller Pause → `pausedAt=null`.
- [ ] **Step 2:** Fix in setPledgeStatus:
```ts
} else if (newStatus === "paused") {
  await db.update(pledges)
    .set({ status: "paused", pausedAt: new Date() })
    .where(eq(pledges.id, pledgeId));
} else {
  // activate: alle Pause-Marker zurücksetzen, sonst überspringt der
  // nächste Sommerpause-Cron diesen Pledge für immer (Flag-Leiche).
  await db.update(pledges)
    .set({ status: "active", sommerpausePaused: false, pausedAt: null })
    .where(eq(pledges.id, pledgeId));
}
```
- [ ] **Step 3:** Tests grün. Commit `fix(billing): Pause-Marker werden bei Reaktivierung zurückgesetzt`.

### Task 4: `endPledges` beendet auch pausierte Pledges nach endsAt (TDD)

**Files:**
- Test: in `tests/actions/pledge-status-transitions.test.ts` ergänzen (DB-Level)
- Modify: `lib/inngest/functions/lifecycle-cleanup.ts:98`

- [ ] **Step 1: Fehlschlagender Test:** paused-Pledge mit `endsAt < now` → nach endPledges-Update-Query status `ended`.
- [ ] **Step 2:** Fix: `eq(pledges.status, "active")` → `inArray(pledges.status, ["active", "paused"])`.
- [ ] **Step 3:** Tests grün. Commit `fix(lifecycle): abgelaufene pausierte Pledges werden beendet`.

### Task 5: Juni-Reparatur-Script

**Files:**
- Create: `scripts/repair-sommerpause-charges.ts`

- [ ] **Step 1:** Script (tsx, lädt `.env.local`): selektiert `matches` mit `status='finished'` und `datum >= 2026-05-15`, deren `crawledAt >= 2026-06-01` ODER die 0 Charges haben, gruppiert nach Team; Default **Dry-Run** (Liste + Counts), `--execute` sendet `match/finished`-Events via `inngest.send` (idempotent dank Unique-Indizes).
- [ ] **Step 2:** Dry-Run gegen Staging-DB ausführen, Counts berichten.
- [ ] **Step 3:** NACH Deploy des Fixes auf main: `--execute` laufen lassen, Ergebnis (inserted-Charges) via DB-Query verifizieren und dem User berichten.

### Task 6: Phase-Abschluss

- [ ] `npm test` komplett + `npx tsc --noEmit` → Output dokumentieren.
- [ ] adversarial-reviewer über den Phasen-Diff.
- [ ] Merge auf main, Staging-Deploy verifizieren, dann Task 5 Step 3.
