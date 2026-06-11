# Phase 2: Geld-Integrität Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Geld-Integritäts-Bugs aus dem Audit 2026-06-11 fixen — kein Verein/Sponsor zahlt doppelt, verliert Charges oder umgeht Caps/Approvals.

**Architecture:** 3 parallele Arbeitspakete mit disjunkten Dateimengen (A: Stripe/Abo-Lifecycle, B: Charge-Pipeline/Invoicing, C: Trigger/Builder/Approvals), je in isoliertem Worktree, TDD pro Task, danach Merge + Gesamt-Review.

**Tech Stack:** Stripe SDK (Test-Mode), Inngest, Drizzle, Vitest (Test-DB + gemockter Stripe-Client, Pattern: tests/actions/subscriptions-checkout.test.ts).

---

## Design-Entscheidungen (verbindlich für Implementierer)

1. **Monats-Cap-Anker = Abrechnungsmonat, nicht Spielmonat.** „monthlyCap=100 €" heißt „max. 100 € pro Abrechnungsmonat (Rechnung)". Cap-Fenster beim Insert = Kalendermonat von `now` (= Monat, in dem die Charge confirmed/billed wird), Summe weiter über `COALESCE(confirmedAt, createdAt)`. Damit sind Cap und generate-invoices-Periode identisch dimensioniert — der heutige Mismatch (Fenster nach Spieldatum, Summe nach Confirm-Zeit) erlaubt 2× Cap auf einer Rechnung. Gleiches Muster für `ruleCapWindow(capPeriod="month")`. Rest-Risiko (pending aus Mai, confirmed im Juni) dokumentieren, nicht lösen.
2. **results_only-Doppel-Charge:** Manuelle `tor`-Events erzeugen KEINE `goal_total`-Proposals mehr, wenn für (pledgeRuleId, matchId) bereits anonyme Auto-Charges (matchEventId IS NULL, status != cancelled) existieren — die Gesamtmenge ist dann schon bezahlt. `goal_by_player` u.a. spieler-bezogene Rules feuern weiterhin (dafür sind die Nachträge da).
3. **Read-Only-Gate verwirft nicht mehr:** `evaluate-match` bricht bei `isReadOnly` ab, MERKT sich das aber nicht — Fix: statt `return` ein `match/evaluation-deferred`-Log + die Charges NICHT verwerfen, sondern Gate nur für `past_due`/`cancelled` greifen lassen; `paused` (Saison-Pass-Sommerpause) erzeugt Charges weiter (die Saison läuft bis 30.6.!). Zusätzlich: Re-Emit-Hinweis im Admin (kein eigener Cron in dieser Phase — Phase 3 Trial-Koppelung entschärft den Hauptfall).
4. **Webhook:** processed-Marker erst NACH erfolgreichem Handling persistieren (Transaktion oder marker-am-Ende + idempotente Handler). Ordering: bei `customer.subscription.*` nicht das Event-Payload als Wahrheit nehmen, sondern Subscription frisch von Stripe fetchen (authoritative sync). `invoice.paid` reaktiviert nur, wenn die frisch gefetchte Subscription wirklich active/trialing ist.
5. **Plan-Wechsel:** Hat der Club eine aktive Subscription mit `stripeSubscriptionId`, KEIN neues Checkout — stattdessen `stripe.subscriptions.update` (Items-Swap auf neue Price-ID, `proration_behavior: "create_prorations"`). Checkout nur für Erst-Abo / nach Kündigung.
6. **payment_method_types entfernen** — Dynamic Payment Methods (STATE.md-Intent). Kein Ersatz-Hardcoding.
7. **Trial beim Checkout:** `trial_end` = club.trialEndsAt (Unix), nie `trial_period_days: 30` (Reset-Bug). trialEndsAt in der Vergangenheit/null → kein Trial-Param.
8. **Saison-Pass-Sommerpause:** `pause_collection.behavior: "keep_as_draft"` statt `"void"` — Renewals mit Anniversary im Sommer gehen nicht mehr verloren, Invoice wird beim Resume finalisiert.
9. **Basic-Downgrade:** Beim Downgrade-Webhook (Pro→Basic) werden Über-Cap-Pledges (neueste zuerst, >5 Sponsoren) pausiert (setzt pausedAt!) und Über-Cap-Rules (>3 pro Sponsor) via effectiveUntil deaktiviert — deterministisch, idempotent, Mail an Club-Admin.
10. **season_custom braucht Sponsor-Approval:** `season_custom` in beide MANUAL_TRIGGERS-Sets; evaluate-season erzeugt `pending_approval`. Da Saison-Charges keine matchEvents haben: Bestätigung läuft DIREKT auf der Charge (neue Actions `confirmSeasonCharge`/`disputeSeasonCharge` mit Sponsor-Tenancy-Check) + Abschnitt in der Sponsor-Inbox + Mail. `expire-approvals`-Analog: Saison-Charges pending > 21 Tage → cancelled (im selben Cron).
11. **Hattrick/Comeback:** Sobald ein beitragendes Tor-Event `source="manual"` ist → `requiresApproval: true` für outcome-Proposals (hattrick/comeback_win), sonst Auto-Confirm wie bisher (rein gescrapte Evidenz).
12. **Phantom-Tore:** `goalTotal` zählt pro Seite maximal `min(events, offizieller Score)`; manuelle `tor`-Events auf `scheduled`-Matches erzeugen keine Sofort-Proposals (Charges entstehen beim `finished`-Übergang via evaluate-match).
13. **Periode:** `invoicing/period.ts` auf halb-offene Intervalle `[monthStart, nextMonthStart)` umstellen (kein 1s-Loch). UTC-Anker bleibt (dokumentierte Vereinfachung).
14. **Domains:** EIN Fallback-Helper `lib/utils/base-url.ts` → `NEXT_PUBLIC_BASE_URL` mit Fallback `https://kickpact.com`; alle drei Streustellen (subscriptions.ts:18, expire-trials.ts:22, webhook/route.ts:139) umstellen.
15. **Migration:** Nur Paket B erzeugt eine Migration (0054: `charges_unique_season_idx` partial auf `status <> 'cancelled'` via DROP+CREATE). Journal-`when` > 1782400000000 bumpen.

## Arbeitspakete

### Paket A — Stripe/Abo (Dateien: lib/actions/subscriptions.ts, app/api/stripe/webhook/route.ts, lib/db/queries/subscription-status.ts, lib/billing/season-pass.ts, lib/billing/plan-features.ts, lib/utils/base-url.ts NEU, lib/inngest/functions/expire-trials.ts)
- [x] A1: Plan-Wechsel via subscriptions.update statt Doppel-Checkout (Design 5) — Test: bestehendes Abo + Wechsel → kein checkout.sessions.create, stattdessen update mit neuer Price.
- [x] A2: payment_method_types raus (Design 6) — Test: create-Aufruf enthält den Key nicht.
- [x] A3: trial_end statt trial_period_days (Design 7) — Tests: Rest-Trial, abgelaufener Trial, kein Trial.
- [x] A4: Webhook-Marker nach Erfolg + authoritative Re-Fetch + invoice.paid-Guard (Design 4) — Tests: Handler-Fehler ⇒ Marker fehlt (Retry möglich); stale subscription.updated überschreibt nicht; invoice.paid auf gekündigte Sub reaktiviert nicht.
- [x] A5: past_due-Grace deterministisch — neue Spalte? NEIN: `pastDueSince`-Ableitung über Stripe-Status-Wechselzeitpunkt aus dem authoritative Fetch (`subscription.status==='past_due'` ⇒ beim Sync `pastDueSince` setzen, sonst nullen; Spalte existiert evtl. schon — prüfen, sonst Teil von Paket-B-Migration ABSTIMMEN: stattdessen ohne Schema: nutze Stripe `latest_invoice.due_date`… Implementierer entscheidet minimal-invasiv MIT Test).
- [x] A6: Saison-Pass keep_as_draft (Design 8) — Test auf Param.
- [x] A7: Basic-Downgrade-Enforcement (Design 9) — Tests: 7 Sponsoren → 2 neueste pausiert; Rules > 3 → effectiveUntil gesetzt; idempotent bei doppeltem Webhook.
- [x] A8: base-url-Helper + 3 Stellen (Design 14) — Test auf Fallback kickpact.com.

### Paket B — Charge-Pipeline (Dateien: lib/inngest/functions/evaluate-match.ts, lib/inngest/functions/generate-invoices.ts, lib/actions/match-events.ts, lib/db/queries/evaluation.ts (nur Cap-Fenster), lib/invoicing/period.ts, lib/db/schema/charges.ts + Migration 0054)
- [x] B1: Cap-Anker Abrechnungsmonat (Design 1) — Tests: Mai-Spiel im Juni gescraped zählt in Juni-Fenster; 2 Mai-Spiele im Juni ⇒ Cap greift beim zweiten.
- [x] B2: results_only-Doppel-Charge (Design 2) — Tests beide Richtungen.
- [x] B3: Read-Only-Gate nur past_due/cancelled, paused chargt weiter (Design 3) — Tests.
- [x] B4: Approval-Row-Restauration: Charge-Insert mit requiresApproval+matchEventId stellt fehlende eventApprovals-Row her (Parität zu addManualEvent: expiresAt-Dauer übernehmen) — Test: Re-Eval nach Invalidate erzeugt Approval-Row.
- [x] B5: Cap-Check in addManualEvent in die tx (tx statt db) — Test: zwei Proposals desselben Events sehen einander.
- [x] B6: Rechnungsversand-Fehler nicht verschlucken: Mail-Step wirft (Inngest-Retry), invoiced-Status erst nach Mail-Erfolg — Tests mit gemocktem resend-Fail.
- [x] B7: goalTotal-Score-Deckel + keine Sofort-Proposals auf scheduled (Design 12) — Tests.
- [x] B8: Periode halb-offen (Design 13) — Test: Charge um 23:59:59.500 fällt in den Monat.
- [x] B9: Migration 0054 season-idx ohne cancelled (Design 15) — Test: cancelled-Saison-Charge blockiert Re-Emission nicht.

### Paket C — Trigger/Builder/Approvals (Dateien: lib/validations/pledge.ts, app/(sponsor)/sponsor/pledge/new/_actions/create-pledge.ts, lib/crawler/triggers.ts, lib/inngest/functions/evaluate-season.ts, lib/inngest/functions/lifecycle-cleanup.ts (Saison-Expiry), lib/actions/approvals.ts, lib/actions/season-charges.ts NEU, Sponsor-Inbox-UI, lib/actions/pledges.ts (MANUAL_TRIGGERS))
- [x] C1: Zod-Param-Validierung pro Trigger-Typ: goals_scored_min/goal_diff_min brauchen Schwellwert ≥1; goal_by_player braucht player_name; monthlyCapEur > 0 — UI-Fehler in Step der Regel + Server-Reject. Engine-Hardening: fehlender Schwellwert ⇒ Regel feuert NICHT (statt >=0).
- [x] C2: season_custom-Approval-Flow komplett (Design 10) — Tests: evaluate-season erzeugt pending; confirmSeasonCharge nur durch Sponsor; Expiry nach 21 Tagen.
- [x] C3: Hattrick/Comeback requiresApproval bei manueller Evidenz (Design 11) — Tests.
- [x] C4: confirmApproval-Row-Selektion: status-Filter pending_approval + ORDER BY createdAt DESC — Test mit cancelled+pending-Paar.
- [x] C5: Tote evaluateSeasonTriggers-Engine + zugehörige Tests entfernen (Verwechslungsgefahr; produktiv ist isTriggerHit).
- [x] C6: MANUAL_TRIGGERS-Duplikat konsolidieren (eine Quelle, z.B. lib/triggers/manual-triggers.ts, beide Importstellen).

## Abschluss
- [x] Merge A+B+C (ein Branch, sequentiell statt parallele Worktrees), voller `npm test` (1096 passed) + `npx tsc --noEmit` (clean), Review über Phasen-Diff mit 5 gefixten Befunden (A6-Draft-Finalisierung beim Resume, A7-Sommerpause-Downgrade-Lücke, B6-Draft-Recovery-Guard, C1-Editor-Bypass, payment_failed-Ordering). Push auf main: ausstehend (Phase 6 / Abschluss).
