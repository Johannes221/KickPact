# Pricing-v2 Audit Report — 2026-05-24

> **Kontext:** Während ich (Phase 2 aus dem Codebase-Audit 2026-05-24) parallel arbeitete, hat ein anderer Worktree-Agent das gesamte Pricing-v2-Paket (`1803db1 merge: Phase 2 — Pricing v2`) in `main` reingespielt. Dieser Report ist ein unabhängiger Code-Review der gemergten Pricing-v2-Implementierung (Schema, Billing-Logik, Cron-Jobs, Stripe-Integration, Tests, Doku).

## 1. CRITICAL Findings (Geld-falsch, Schema-Drift, Sicherheits-Lücken)

### 1.1 Drei-Wege-Drift bei Annual-Preisen

**Stellen:**
- `tests/stripe/pricing.test.ts:31-37`
- `lib/stripe/pricing.ts:64,96,131`
- `docs/pricing.md:16,173,258`

**Befund:** Tests asserten `basic/pro/verein annual = 49 €/189 €/489 €`. Code (`pricing.ts`) hat `35 €/135 €/349 €`. Doku hat `35 €/135 €/349 €`. **`npm test` läuft sofort rot.**

**Fix:** Test-Erwartungen an `pricing.ts` + docs angleichen (35/135/349). Side-Effekt: `getSavings`-Block (Z. 75–82) testet Pro/Annual ≈ 17 % Ersparnis (`228 - 189 = 39`), mit 135 € sind es aber `228 - 135 = 93 / 228 ≈ 40 %` — Test ist auch hier kaputt.

### 1.2 Saison-Pass/Annual-Checkout ignoriert `cycle`

**Stelle:** `lib/actions/subscriptions.ts:22-41`

**Befund:** `createCheckoutSession({clubSlug, plan})` nimmt KEIN `cycle`. `getStripePriceId(opts.plan)` fällt auf Default `cycle="monthly"`. Onboarding speichert zwar `subscriptions.billing_cycle = 'season'` (siehe `finalize.ts:137`), aber der erste Stripe-Checkout berechnet IMMER monthly.

**Reproduktion:** Onboarding mit cycle=season durchklicken → `/verein/[slug]/abo` → Checkout → Stripe-Hosted-Page zeigt 5 €/Monat statt 39 €/Saison.

**Fix:** `createCheckoutSession({plan, cycle})` + an Caller propagieren (`startCheckoutAndRedirect`, abo-page).

### 1.3 Webhook spiegelt `billing_cycle` niemals zurück, mappt `paused` falsch

**Stelle:** `app/api/stripe/webhook/route.ts:43-122`

**Befund 1:** `priceIdToPlanCycle()` existiert in `pricing.ts:184-194`, wird aber nirgendwo gerufen. Selbst wenn Stripe-Checkout cycle=season durchführt, bleibt `subscriptions.billing_cycle = 'monthly'` (DB-Default).

**Konsequenz:** `pauseSeasonPassSubscriptions` (`season-pass.ts:45`) filtert `where billing_cycle='season'` und findet **null Rows**. Sommerpause wird nie eingeleitet — **Stripe bucht im Juni/Juli weiter ab, obwohl Marketing „2 Monate geschenkt" verspricht** → Refund-Lawine.

**Befund 2:** `mapStripeStatus` (Z. 122) mappt Stripe-`"paused"` → `"incomplete"`, obwohl unser Enum `paused` kennt. Wenn Stripe Pause meldet, landet's als `incomplete` → App sperrt Verein fälschlich auf read-only.

**Fix:** Beide invoice/subscription-Webhook-Handler rufen `priceIdToPlanCycle()` für `subscriptionItem.price.id` und schreiben `billing_cycle`. `mapStripeStatus` mapped `paused` → `paused`.

### 1.4 Saison-Wetten-Tier-Gate fehlt

**Stelle:** `app/(sponsor)/sponsor/pledge/new/_actions/create-pledge.ts:114-127`

**Befund:** Wager-Window-Cutoff wird geprüft, aber **NICHT** `getTeamLicensePlan(team) ∈ {pro, verein}`. Laut `docs/pricing.md` §8 + §5 ist Saison-Wetten Pro/Verein-only.

**Reproduktion:** Sponsor auf Basic-Team-Pledge mit `triggerType: "season_promotion"` → Pledge wird erstellt → Verkaufs-Argument fürs Pro-Upgrade verschwindet.

**Fix:** Vor `assertWagerWindowOpen` zusätzlich `if (plan === 'basic') throw new Error("Saison-Wetten benötigen Pro")`.

### 1.5 `parentClubLicenseId` ist tote Spalte

**Stellen:** `lib/db/schema/billing.ts:68-71` + `lib/db/queries/pledges.ts:43-50`

**Befund:** Schema hat Master-License-Self-Ref, aber **kein einziger Code-Pfad setzt oder liest sie**. Die Vereinslizenz-Bündelung („∞ Mannschaften unter einer Lizenz" laut docs §4) ist real nicht implementiert. `getTeamLicensePlan` macht ein `select limit 1` ohne Vererbung.

**Effekt:** Bei Verein-Plan zahlt der Verein 49 €/Monat, aber jedes Team braucht trotzdem eine eigene License-Row. Onboarding (`finalize.ts:141-147`) erzeugt nur 1 Team-License → zweites Team via Dashboard hinzufügen → keine License-Row → `getTeamLicensePlan(team2)` → "basic" Default → Team 2 nutzt Basic-Caps trotz Verein-Abo.

**Fix:** Beim Anlegen weiterer Teams unter Verein-Plan automatisch `teamLicenses`-Row mit `parentClubLicenseId` setzen + `getTeamLicensePlan` rekursiv über parent lesen.

## 2. HIGH Findings (Race-Conditions, fehlende Idempotenz, Cron-Lücken)

### 2.1 `pause/resume-season-passes` ohne Concurrency-Limit, ohne deterministische Step-IDs

**Stellen:** `lib/inngest/functions/pause-season-passes.ts:11-12`, `resume-season-passes.ts:11-12`

**Befund:** Andere kritische Funktionen setzen `concurrency: { limit: 1 }` (z.B. `verify-results.ts:44`). Beide neuen Funktionen rufen `stripe.subscriptions.update` ohne deterministische Step-IDs. Bei Inngest-Retry wird der ganze For-Loop wiederholt.

**Fix:** `concurrency: {limit: 1, key: "season-pass-lifecycle"}` und jedes Stripe-Update als eigener `step.run(\`pause-${clubId}\`)`.

### 2.2 `getActiveSeasonForDate` bricht im Frühbucher-Juni-Fenster

**Stelle:** `lib/db/queries/seasons.ts:17-32`

**Befund:** Kommentar sagt "akzeptieren `[startsAt - 60d, endsAt + 30d]`". Code: `lookahead = today - 60d`, `lookbehind = today + 30d`, Filter `startsAt ≤ today+30d AND endsAt ≥ today-60d`.

**Reproduktion:** today = 1.6.2026, Saison 2627 startsAt = 1.8.2026 → `startsAt (1.8.) ≤ today+30d (1.7.)` ist **false** → null → `canBookSeasonPass` returnt false. Frühbucher-Juni broken.

**Fix:** Window auf `today + 90d` erweitern. Plus: Variable-Namen sind semantisch swap (`lookahead = today - 60d` ist in der Vergangenheit, `lookbehind = today + 30d` ist in der Zukunft).

### 2.3 Migration 0012 `ALTER TYPE ... ADD VALUE` in Transaktion

**Stelle:** `drizzle/migrations/0012_pricing_v2.sql:2-4`

**Befund:** PostgreSQL verlangt für `ALTER TYPE … ADD VALUE` non-transactional execution. Wenn `drizzle-kit` die Migration in einer impliziten Transaktion fährt (Default), schlägt der Migrate fehl.

**Status auf Prod:** Migration ist heute aber erfolgreich gelaufen (`npm run db:migrate` von mir ausgeführt). Vermutlich akzeptiert die Neon-Variante das. Aber bei Re-Run auf einer frischen DB könnte's fehlschlagen.

**Fix vorsichtshalber:** `ALTER TYPE` mit `--> statement-breakpoint` aus der Transaktion ziehen.

### 2.4 Saison-Seed fehlt komplett

**Befund:** Kein Script in `/scripts` legt `seasons`-Rows an. Code-Pfade: `getActiveSeason` → null → `canBookSeasonPassPure` → false. In Prod heißt das: **niemand kann je einen Saison-Pass buchen**.

**Fix:** `scripts/seed-seasons.ts` mit mindestens den nächsten 3 Saisons (2526, 2627, 2728), als Teil von `db:migrate` oder als Inngest-cron.

## 3. MEDIUM Findings

- **`create-pledge.ts:130-133`** — `seasonEnd` nutzt `now.getMonth()` (LOCAL), nicht UTC. Inkonsistent mit `season-pass-dates.ts` (UTC). Edge-Case 30.6. 23:30 UTC = 1.7. CET. Fix: `getUTCMonth()`.

- **`pause-season-passes.ts:13`** — Cron `0 2 1 6 *` (02:00 UTC = 04:00 CEST am 1. Juni). Stripe könnte am 1.6. bereits eine Charge gepostet haben, bevor `pause_collection` greift. Besser: `0 22 31 5 *` (22:00 UTC am 31.5.).

- **`season-pass.ts:55-62`** — Pause-Loop ohne try/catch. Erster Stripe-Fehler (z.B. Sub gelöscht) bricht den ganzen Loop ab. Fix: per-club try/catch + Fehler-Sammler wie in `generate-invoices.ts`.

- **Test-Coverage:** Keine Tests für `pauseSeasonPassSubscriptions`/`resumeSeasonPassSubscriptions` (nur Date-Helper), keine Tests für `getActiveSeasonForDate` (sonst wäre Bug oben aufgefallen), keine Tests für `priceIdToPlanCycle` mit Drift, kein Test für `mapStripeStatus` paused-Case.

- **`tests/billing/wager-window.test.ts`** — DST-Cutoff-Edge fehlt (z.B. matchdayFiveAt = 25.10.2026 22:00Z). Erwähnen dass Cutoff strikt UTC ist.

- **`tests/queries/pledges-caps.test.ts`** — testet `assertCanAddPledgeRule` nur mocked. Race bei `countPledgeRulesForSponsorOnTeam` ungetestet.

## 4. LOW Findings

- `lib/db/queries/seasons.ts:18-19` — Variable-Namen `lookahead`/`lookbehind` swap.
- `lib/inngest/functions/season-end-reminders.ts:23` — TODO „dedupe-Tabelle" noch offen, Cron spammt täglich.
- `generate-invoices.ts:35-51` — `TRIGGER_LABELS` duplicate of `lib/triggers/labels.ts` (Comment sagt es selbst). Drift-Risiko.
- `docs/pricing.md:336` referenziert `lib/db/schema.ts` singular, ist aber Verzeichnis.
- `lib/billing/wager-window-server.ts:16` — `getActiveSeason` exportiert eigene Signatur statt `SeasonRow` direkt; `toSeasonWindow` ist redundant.

## 5. Top-3 Bedenken (mit Reproduzierbarkeit)

1. **Saison-Pass-Pause läuft NIE auf Prod**, weil `billing_cycle` nie gesetzt wird (Befund 1.3). Konsequenz: Verein zahlt im Juni/Juli weiter, obwohl Marketing „2 Monate geschenkt" verspricht → Refund-Lawine + Vertrauensverlust. **Höchste Prio.**

2. **`createCheckoutSession` ignoriert `cycle`** (Befund 1.2). Stripe-Hosted-Page zeigt Monthly-Preis statt Saison-Pass. Geld-falsch in beide Richtungen.

3. **Vereinslizenz-Bündelung ist unwired** (Befund 1.5). Marketing-Verspechen „∞ Mannschaften unter einer Lizenz" wird nicht eingehalten; zweites Team unter Verein-Plan fällt auf Basic-Caps zurück.

## 6. Status der Audit-Befunde

Dieser Pricing-v2-Audit erweitert den Hauptaudit `docs/superpowers/plans/2026-05-24-codebase-audit.md` um einen achten Themenblock („Pricing-v2-Implementierung"). Die Punkte 1.1–1.5 sind Phase-2-Show-Stopper-Kandidaten (CRITICAL), 2.1–2.4 sollten in Phase 3 mit den Stripe-/Subscription-Lifecycle-Fixes zusammen erledigt werden.
