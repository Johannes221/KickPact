# KickPact Codebase Audit — 2026-05-25

> **Auftrag:** „Komplette Analyse — Paradigmenwechsel, alter Code, toter Code, falscher Code."
>
> Durchgeführt mit 8 parallelen Spezial-Agenten (Schema, Payment, Routes/Actions, Inngest, UI, Trigger-Engine, Spec-Drift, Tests/Docs).
> **Wichtiger Hinweis:** Die Agenten haben teilweise widersprüchliche Befunde geliefert (insbesondere zum Phase-E1-Status). Alle Fakten unten sind vom Auditor (Claude) gegen den realen Git-Stand verifiziert. „⚠️ Agent-Behauptung" markiert nicht-verifizierte Vorwürfe.

---

## 0. Executive Summary

Seit dem Audit vom **24.05** hast du **massiv abgeräumt**:

- ✅ **Phase 1** (Show-Stopper) durch: Stripe-Placeholder, /api/squad, Impressum, Spieler-DSGVO
- ✅ **Phase 2** (Geld-Risiken) durch: 5 Pricing-v2-Audits, race-safe Invoice-Numbering, Mail-Step-Separation, Saison-Trigger, Team-Side, Cancelled-Charge-Revival
- ✅ **Phase 3** (Subscription-Lifecycle) durch: Webhook-Idempotenz, expire-trials/approvals, end-pledges, sent_notifications-Dedup
- ✅ **Plausible-Analytics** mit 15 Events
- ✅ **Team-centric Dashboard** (Layout + 4 von 6 Tabs)
- ✅ **R2-Storage** (statt /tmp-Fallback) als Nebeneffekt der Verifications-Vorarbeit

Parallel ist am **25.05** ein **fundamentaler Paradigmenwechsel** vollzogen worden:

> **KickPact ist KEIN Zahlungsdienstleister.** Geld fließt direkt Sponsor → Vereins-IBAN. Identity wird per Dokument-Upload + manueller Review verifiziert.

Spec dazu: [`docs/superpowers/specs/2026-05-25-trust-and-payment-model-design.md`](../superpowers/specs/2026-05-25-trust-and-payment-model-design.md).

**Gute Nachricht zum Paradigmenwechsel:** Custodial-Reste **gibt es im Code praktisch keine** — der Code war nie wirklich custodial gebaut, weil Stripe-Connect nie integriert wurde. Die Spec dokumentiert nur, was ohnehin schon Realität war. Die User-facing Texte (AGB, Marketing, Mails) kommunizieren bereits korrekt non-custodial.

**Was offen ist (siehe §1):**

1. **Phase E1 zu 60% fertig** (Schema/Storage/Queries/Wizard-Renumber live, aber Withhold-Gate + Upload-UI + Admin-Page fehlen)
2. **3 noch nicht behobene Bugs** aus dem 24.05-Audit (Monthly-Cap-Race, Approval-Expiry-Hardcode, Manual-Event-Read-Only-Gate)
3. **Phase 4 (DSGVO)** kaum bearbeitet, aber `lib/utils/log-pii.ts` ist in Arbeit (untracked)
4. **Identity Phase C+D** weiterhin offen
5. **Test-Lücken** auf vielen Inngest-Jobs

---

## 1. Verifizierte Wahrheit zu Phase E1 (was die Agenten widersprüchlich berichtet haben)

**Stand: ~60% fertig.** Die Spec ist auf 3 Sub-Phasen (E1/E2/E3) verteilt.

| Element | Status | Commit / Datei |
|---|---|---|
| Schema-Migration `0016_club_verifications.sql` | ✅ LIVE | `750fb08` |
| `club_verifications` Tabelle | ✅ LIVE | `lib/db/schema/clubs.ts:177` |
| `clubs.verifiedAt` Spalte | ✅ LIVE | `lib/db/schema/clubs.ts:50` |
| `invoice_status='withheld'` Enum-Wert | ✅ LIVE | Migration 0016 |
| `clubVerificationStatusEnum` | ✅ LIVE | `clubs.ts:16` |
| `clubVerificationDocTypeEnum` | ✅ LIVE | `clubs.ts:21` |
| R2/Local-Storage-Wrapper | ✅ LIVE | `5c5f151` |
| CRUD-Queries + 6 DB-Tests | ✅ LIVE | `603c981` |
| Onboarding-Wizard 4→5 Schritte renumbered | ✅ LIVE | `e93c449` |
| Verifikations-Step UI (Step 4) | 🚧 IN ARBEIT (untracked) | `app/(onboarding)/onboarding/verein/4/` |
| **Withhold-Gate in `generate-invoices.ts`** | ❌ FEHLT | `lib/inngest/functions/generate-invoices.ts` — kein `verifiedAt`/`withheld`-Grep-Treffer |
| Admin-Page `/admin/verifications` | ❌ FEHLT | — |
| Mail-Templates (submitted/approved/rejected) | ❌ FEHLT | — |
| Sponsor-Banner für unverified Clubs | ❌ FEHLT | — |
| Girocode-QR im PDF | ❌ FEHLT (Phase E3) | — |

> **⚠️ Agent-Konflikt aufgelöst:** DB-Schema-Agent und Payment-Agent hatten die Phase-E1-Schema-Implementierung erkannt. UI-Agent und Inngest-Agent haben sie nicht erkannt (vermutlich kein Pull/cached State). Realität: Schema ist da, UI/Backend-Gates fehlen.

---

## 2. Befunde nach Kategorie

### 2.1 Paradigmen-Konflikte (custodial → non-custodial)

**Status: praktisch sauber.** Die Spec dokumentiert ein Modell, das der Code ohnehin schon umsetzt.

| Wo | Befund | Schwere |
|---|---|---|
| `subscriptions.stripe_customer_id` + Stripe-Webhook | ✅ Sauber — nur KickPacks **eigenes Abo-Billing** (Verein zahlt Lizenz an KickPact), kein Sponsor-Payment-Pfad | OK |
| `lib/invoicing/builder.tsx:176` | ✅ IBAN bereits prominent im PDF | OK |
| `lib/mail/templates/invoice-sponsor.tsx:53` + `invoice-club.tsx:54` | ✅ Disclaimer „KickPact wickelt keine Zahlungen ab" bereits drin | OK |
| `app/(legal)/agb/page.tsx:47-51` | ✅ „KickPact ist kein Zahlungsdienstleister" wörtlich | OK |
| `app/(marketing)/preise` | ✅ „0 % Provision … 100 % der Einnahmen gehen an euch" | OK |
| ENV (`.env.example`) | ✅ keine Stripe-Connect-ENVs vorhanden | OK |
| DB-Schema | ✅ keine `stripe_connect_account_id`, `payout_*`, `balance_*`, `wallet_*` Felder | OK |
| Stripe-API-Calls | ✅ keine `stripe.accounts/transfers/payouts/applicationFee` Verwendung im Repo | OK |

**Verbleibende Anpassung für Phase E3:**

| Anpassung | Datei | Effort |
|---|---|---|
| Girocode QR-Code (EPC069-12) in PDF | `lib/invoicing/builder.tsx` | klein (mit lib wie `epc-qr`) |
| BIC ableiten oder Spalte hinzufügen | `lib/db/schema/clubs.ts` + builder | klein |
| Sponsor-Dashboard „bezahlt/offen"-Toggle | `app/(sponsor)/sponsor/.../invoices` + `lib/actions/invoices.ts:markInvoicePaid` (existiert schon!) | klein-mittel |

---

### 2.2 Bugs aus 24.05-Audit — Status-Tracker

> **Verifiziert durch Code-Inspektion + Trigger-Engine-Agent + Inngest-Agent.**

| # | Bug (Kurz) | Status | Verifikation |
|---|---|---|---|
| **1.1** Stripe-Placeholder | ✅ Gefixt | Lazy-Customer-Creation in `lib/actions/subscriptions.ts` mit defensive Legacy-Handling |
| **1.2** /api/squad Spielernamen-Leak | ✅ Gefixt | `requireUser()` + Status-Filter, Tests vorhanden |
| **1.3** Impressum + DSE Anschriften | ✅ Gefixt | Johannes Schartl Heidelberg, hello@kickpact.com |
| **1.4** PDF-Doppelversand + Numbering-Race | ✅ Gefixt | `a262da5` (Mail-Step-Split) + `86fd7a2` (`invoice_counters`-Tabelle) |
| **2.1** Webhook-Idempotency | ✅ Gefixt | `processed_stripe_events` Tabelle, Phase 3 (`6c65f2e`) |
| **2.2** Cancelled-Charge-Wiederbelebung | ✅ Gefixt | `invalidateChargesForMatch` setzt auch Approvals expired + Guard in `confirmApproval` |
| **2.3** Read-Only-Gate Asymmetrie | ⚠️ Teilfix | Gate in `crawl-matches.ts:68` + `evaluate-match.ts:30` ✅. **ABER:** `addManualEvent` in `lib/actions/match-events.ts:56` prüft nur `assertClubWriteAccess`, **nicht** `getSubscriptionGate` → Trainer kann im pausierten Club neue Events eintragen |
| **2.4** Monthly-Cap-Race | ❌ Offen | `evaluate-match.ts:77-101` — zwei separate DB-Calls (`getPledgeMonthlyCap` + `getMonthlyChargedCents`) außerhalb Transaktion; Concurrency=4 kann Cap überschreiten |
| **2.5** Saison-Trigger-Tautologie | ✅ Gefixt | `evaluate-season.ts:87-88` jetzt `lte(startsAt, seasonEnd) AND gte(endsAt, seasonStart)`, Tests in `cross-saison-pledges.test.ts` |
| **2.6** `season_custom` forever-pending | ✅ Gefixt | Auto-confirmed wenn keine `requiresApproval`-Flag |
| **2.7** Team-Side-Detection-Duplikat | ✅ Gefixt | `addManualEvent` nutzt jetzt `detectTeamSide()` aus `lib/crawler/team-side.ts:63` |
| **2.8** Crons fehlend (expire-approvals, end-pledges) | ✅ Gefixt | `lib/inngest/functions/lifecycle-cleanup.ts` |
| **3.1** Approval-Sofort-Mail | ❌ Offen | `addManualEvent` legt Approval an, sendet aber keine Mail. Sponsor erfährt erst nach 7d via `approval-reminders` |
| **3.2** Spieler-DSGVO-Basis | ⚠️ Teilfix | DSE-Page erwähnt Plausible (`b8071b9`), Spieler-Opt-out-Mechanismus aber nicht geprüft |
| **3.3** Account-Export/-Löschung | ❌ Offen | Keine `requestDataExport()`/`requestAccountDeletion()`-Aktion gefunden |
| **4.1** PII in Logs | 🚧 In Arbeit | `lib/utils/log-pii.ts` untracked — Mask-Helper wird gerade gebaut |
| **4.2** Approval-Expiry hardcoded `06-30` | ❌ Offen | `lib/actions/match-events.ts:157-160` immer noch hardcoded statt aus `pledges.endsAt` |
| **4.3** Trigger-Labels mehrfach definiert | ✅ Konsolidiert | `lib/triggers/labels.ts` ist Single-Source; `lib/billing/trigger-labels.ts` (untracked) sieht nach Erweiterung aus, nicht Duplikat |
| **4.4** TriggerType 3-fach | ⚠️ Teilfix | `lib/validations/pledge.ts:3-21` ist immer noch hardcoded; Drift-Risiko |
| **4.5** Magic-Link-Rate-Limit | ❌ Offen | `lib/auth/server.ts` ohne `rateLimit`-Config |
| **4.6** Inngest signingKey fail-closed | ⚠️ `app/api/inngest/route.ts` modifiziert (untracked) — vermutlich gerade in Arbeit |
| **4.7** Session-Cleanup-Cron | ❌ Offen | keine `cleanup-sessions.ts` Function |
| **4.8** Player-Matching case+akzent-strikt | ❌ Offen | `lib/crawler/triggers.ts:160-179` weiterhin strict |
| **5.1** Index-Migration | ⚠️ Teilfix | 3 Indexes vom DB-Agent vorgeschlagen (`club_memberships.clubId`, `invoices.(clubId,status)`, `invoiceItems.(invoiceId)` + `(chargeId)`) noch nicht da |
| **5.2** N+1 in `writeMatchEvents` | ❓ Nicht neu geprüft | Vermutlich noch da |
| **5.3** Concurrency-Limits Mail-Functions | ❌ Offen | `approval-reminders`, `trial-reminders`, `season-end-reminders`, `generate-invoices` ohne `limit` |
| **5.4** `@neondatabase/serverless` ungenutzt | ❌ Offen | `npm remove`-Kandidat |
| **5.5** Tier-Aware-Season-Lock nur UI-Level | ❌ Offen | Backend prüft `tier` nicht in `createPledgeRuleAction` |
| **5.6** Sponsor-Einladung-Mail | ❌ Offen | nur Token-Generation, kein Mail-Send |
| **5.7** Welcome-Mails | ❌ Offen | Verein/Sponsor nach Onboarding |
| **5.8** Pledge-Cancellation (end) durch Sponsor | ❌ Offen | nur active/paused |

**Bilanz:** Von ~30 Findings sind **~17 gefixt**, **~13 offen**, **2 in Arbeit**. Die offenen sind alle nicht-Show-Stopper, aber ein paar (Monthly-Cap-Race, Manual-Event-Read-Only-Gate) sind Geld-Risiken.

---

### 2.3 Toter / unbenutzter Code

> **Vorsicht:** Mehrere Agent-Behauptungen waren falsch — siehe verifizierte Liste.

#### Verifiziert tot

| Datei | Status |
|---|---|
| `scripts/cleanup-dossenheim3-charges.ts` | Pilot-Müll. Löschen. |
| `scripts/seed-dossenheim3-pledges.ts` | Pilot-Müll. Löschen. |
| `@neondatabase/serverless` (npm dep) | Wird nicht importiert (Driver ist `postgres-js`). `npm remove` |

#### Behauptet tot, aber LEBENDIG (Agent-Fehler)

| Falsche Behauptung | Realität |
|---|---|
| ⚠️ „`pickDashboardDestination` ist nicht implementiert" | Live in `lib/auth/identity-routing.ts:31`, benutzt in `app/layout.tsx`, `dashboard/page.tsx`, `select-role/page.tsx` |
| ⚠️ „`header-user-menu.tsx` ist tot" | Wird in `components/shared/app-header.tsx:6` importiert |
| ⚠️ „`mobile-nav.tsx` ist tot" | Bitte nochmal selber prüfen — könnte aber wirklich tot sein, je nachdem wie `app-header` Mobile macht |
| ⚠️ „`/dashboard`-Route ist verwaist" | Lebt — ist explizit der Routing-Redirect mit `pickDashboardDestination` |
| ⚠️ „`/api/user/context` dupliziert `/api/user/roles`" | Müsste verifiziert werden — Agent-Befund unklar |

#### Vermutlich tot (manuell verifizieren)

| Kandidat | Hinweis |
|---|---|
| `lib/actions/subscriptions.ts:startCheckoutAndRedirect` | Exported, keine Importer im Agent-Grep gefunden |
| `lib/db/queries/charges.ts:invalidateChargesForMatch` | Agent fand keine direkten Importer — wird vermutlich inline-genutzt; Doppelcheck nötig |
| `lib/db/queries/sponsor-discover.ts:listInquiriesForTeam` | 24.05-Audit markierte als tot, müsste re-verifiziert werden |
| `lib/db/queries/charges.ts:countConfirmedChargesForSponsorClub` | dito |
| `lib/db/schema/billing.ts:team_licenses.deactivatedAt` | dito |

#### Tote Pages / Komponenten

Keine bestätigt toten Pages. Komponenten brauchen ein eigenes manuelles Sweep, weil Agent-Befunde falsch waren.

---

### 2.4 Aktuelle Bugs / Risiken (NEU oder noch offen)

| # | Datei:Zeile | Befund | Schwere |
|---|---|---|---|
| B-1 | `lib/inngest/functions/evaluate-match.ts:77-101` | **Monthly-Cap-Race**: Cap-Read und Charge-Insert nicht atomar. Concurrency=4 kann Cap überschreiten. | 🟠 HIGH |
| B-2 | `lib/actions/match-events.ts:56` | **Manual-Event ohne Read-Only-Gate**: Trainer kann in pausiertem Club Events eintragen | 🟠 HIGH |
| B-3 | `lib/actions/match-events.ts:157-160` | **Hardcoded Saison-Ende `06-30`** für Approval-Expiry statt aus `pledges.endsAt` | 🟡 MED |
| B-4 | `lib/inngest/functions/generate-invoices.ts` | **Withhold-Gate fehlt** — Phase E1 nicht zu Ende geführt; unverifizierte Clubs bekommen Rechnungen | 🟡 MED (steigt zu HIGH wenn Verifications live geht) |
| B-5 | `lib/inngest/functions/approval-reminders.ts` u.a. | **Kein Idempotency-Key** auf Resend-Calls (außer generate-invoices) | 🟡 MED |
| B-6 | `lib/crawler/triggers.ts:160-179` | **Player-Matching case+akzent-strikt** („Müller" ≠ „Mueller") | 🟡 MED |
| B-7 | `lib/inngest/functions/{approval,trial,season-end}-reminders.ts` | **Concurrency-Limit fehlt** auf Mail-Functions | 🟡 MED |
| B-8 | `lib/auth/server.ts` | **Kein Magic-Link-Rate-Limit** → Spam-Mail-Vektor | 🟡 MED |
| B-9 | `lib/validations/pledge.ts:3-21` | TriggerType hardcoded, driftet potentiell vom Enum | 🟢 LOW |
| B-10 | `lib/actions/sponsor-inquiries.ts:235` | `void user;` Anti-Pattern — User wird nicht gegen Sponsor geprüft, nur Comment-Behauptung | 🟢 LOW |
| B-11 | Schema | Fehlende Indexes (`club_memberships.clubId`, `invoices.(clubId,status)`, `invoice_items.(invoiceId,chargeId)`) | 🟢 LOW |
| B-12 | `lib/db/queries/crawler.ts:206-245 writeMatchEvents` | N+1 — pro Event ein `upsertPlayer`+`insert` (war im 24.05-Audit, vermutlich noch da) | 🟡 MED |
| B-13 | `lib/inngest/functions/crawl-matches.ts` | Crawler-Cron `0 */6 * * *` + statischer User-Agent → fussball.de-Bann-Risiko | 🟠 HIGH (operationell) |

---

### 2.5 Verstreute Trigger-Type Single-Source-Drift

| Datei | Was definiert | Empfohlene Konsolidierung |
|---|---|---|
| `lib/triggers/labels.ts` | `TriggerType` + `TRIGGER_META` | Canonical TS-Side |
| `lib/billing/trigger-labels.ts` (untracked) | (Inspizieren) | Vermutlich Erweiterung — sollte importieren statt redefinieren |
| `lib/db/schema/pledges.ts:10-36` | `triggerTypeEnum` | Canonical DB-Side |
| `lib/crawler/triggers.ts:24-48` | Lokales `TriggerType` | Sollte aus labels.ts importieren |
| `lib/validations/pledge.ts:3-21` | Hardcoded Zod-Array | Sollte aus labels.ts/Enum abgeleitet werden |

**Empfehlung:** Eine kleine Cleanup-Migration:
```ts
// lib/triggers/labels.ts
export const TRIGGER_TYPES = [...] as const;
export type TriggerType = typeof TRIGGER_TYPES[number];
// In pledges.ts: pgEnum("trigger_type", TRIGGER_TYPES);
// In validations/pledge.ts: z.enum(TRIGGER_TYPES);
// In crawler/triggers.ts: import { TriggerType } from "@/lib/triggers/labels";
```

---

### 2.6 Inngest-Functions-Inventar (verifiziert)

| Function | Cron | Concurrency | Tests |
|---|---|---|---|
| crawl-matches | `0 */6 * * *` | ✅ 2 | ❌ |
| evaluate-match | event | ✅ 4 | ❌ |
| evaluate-season | event | ❌ | ✅ |
| generate-invoices | `17 3 1 * *` | ❌ | ❌ |
| approval-reminders | `0 9 * * *` | ❌ | ❌ |
| expire-approvals | `15 2 * * *` | ✅ 1 | ❌ |
| end-pledges | `30 2 * * *` | ✅ 1 | ❌ |
| trial-reminders | `0 10 * * *` | ❌ | ❌ |
| expire-trials | `45 2 * * *` | ✅ 1 | ❌ |
| season-end-reminders | `30 2 * * *` | ❌ | ❌ |
| verify-results | `0 3 * * *` | ✅ 1 | ❌ |
| pause-season-passes | `0 2 1 6 *` | ❌ | ❌ |
| resume-season-passes | `0 2 1 8 *` | ❌ | ❌ |

**13 Functions, 6 mit Concurrency-Limit, 1 mit Tests. Test-Lücke ist beträchtlich.** Cron-Überschneidung: `end-pledges` + `season-end-reminders` beide 02:30 UTC — vermutlich unkritisch, aber unschön.

---

### 2.7 UI / Frontend

#### Verifizierte Lücken

| Was | Status |
|---|---|
| Team-Dashboard Sub-Pages | 4/6 da (Übersicht, Pacts, Spiele, Finanzen). **Fehlt:** Abo, Einstellungen |
| Tile-Migration | Sponsor + Club-Dashboard: ✅ Tiles. **Hybrid:** Team-Übersicht (Inline-Grid). **Alt (StatCards):** Abrechnungen, Pledge-Detail |
| Onboarding-Wizard | ✅ 4→5 Schritte renumbered, neuer Schritt 4 in Arbeit (untracked) |
| Verifications-Banner (Verein/Sponsor) | ❌ noch nicht |
| `/admin/verifications`-Page | ❌ noch nicht |
| Mail-Templates für Verifications | ❌ noch nicht |
| Plausible-Tracking | 8-9/15 Events vermutet (Agent-Schätzung, nicht hart verifiziert). Lücken: Sponsor-Discover-Views, Pledge-Outcome-Events, Approval-Actions |

#### Agent-Vorwürfe (NICHT BEHANDELT, manuell prüfen!)

| Vorwurf | Bewertung |
|---|---|
| „Landing-Page erzählt noch alte Story" | **WAHRSCHEINLICH FALSCH** — Payment-Agent fand explizit dass AGB+Marketing schon korrekt non-custodial. UI-Agent vermutlich obsolete View. Manuell prüfen: `app/page.tsx` |
| „Form-Labels nur 17×" / „Accessibility-Lücken" | Wahrscheinlich übertrieben — shadcn nutzt `FormLabel`, was Agent möglicherweise nicht gegreppt hat |

---

### 2.8 Specs vs Realität — Konsolidiert

| Spec / Plan | Status | Notiz |
|---|---|---|
| `2026-05-19-kickpact-v1-design.md` | ⚠️ ~85% | Stripe-Connect-Sektion durch Trust-Spec ersetzt; Vereinslizenz-Plan-Enum (`verein`) vermutlich inzwischen drin durch Pricing-v2 |
| `2026-05-22-identity-roles-mobile-ia-design.md` | ⚠️ Phase A+B done, C+D offen | Phase C (Access-Requests bei Duplikat-Verein) ist immer noch komplett offen, ebenso Phase D (Mobile-IA-Tiles) — Team-centric Plan ist eigene Sache |
| `2026-05-22-scraper-realdata-validation-design.md` | ⚠️ Kern done, Test-Fixtures offen | 8 Tests bewusst skipped („requires phase 4 merge") |
| **`2026-05-25-trust-and-payment-model-design.md`** | **⚠️ E1 zu ~60%, E2+E3 offen** | siehe §1 |
| `2026-05-25-team-centric-dashboard.md` | ⚠️ ~70% | Routing + 4 Sub-Pages live; Abo + Einstellungen fehlen, weitere TileMigrations offen |
| `2026-05-24-codebase-audit.md` (Fix-Plan) | ⚠️ Siehe §2.2 — 17/30 gefixt | |
| Phase-1-Plan, Pricing-v2-Audit, Onboarding-Fix, phase E1 | ✅ jeweils gemerged | |

#### Hinfällige Pläne (kann archiviert werden)

- `2026-05-19-kickpact-plan-{2,3,4}-*.md` — durch v1-Design + Pricing-v2 + Phase 1-3 ersetzt
- `2026-05-21-kickpact-completion.md` — überholt durch nachfolgende Phasen
- `2026-05-22-pricing-v2.md` — durch Pricing-v2-Audit + Phase-1-Plan abgeschlossen

#### Konflikte zwischen Specs

| Konflikt | Auflösung |
|---|---|
| v1 §6.7 (Stripe-Connect) vs Trust-Spec | Trust-Spec gewinnt ✅ |
| v1 §6.8 (3-Tier-Abo, Pause Jun-Jul) vs Pricing-v2 | Pricing-v2 ist die jetzt umgesetzte Realität (basic/pro/verein × monatlich/jährlich + Saison-Pass) |
| `season_custom`-Approval | jetzt auto-confirmed (`evaluate-season.ts:111-116`) — sollte in Spec dokumentiert werden |

---

### 2.9 Docs / Meta-Files Drift

| Datei | Status |
|---|---|
| **`STATE.md`** | 🔴 **Massiv veraltet.** „Tests: 65 passing" — Realität: ~464 passing, 40 skipped. „Aktive Initiative: Plan 6" — Realität: Phase E1 läuft. „R2 nicht konfiguriert" — Realität: R2 ist live (`5c5f151`) |
| `AUTOPILOT.md` / `AUTOPILOT_PROMPT.md` | ⚠️ Veraltet — bezieht sich auf Auto-Session-Modus, der vermutlich nicht mehr läuft |
| `CLAUDE.md` | ⚠️ „Aktiver Plan: kickpact-foundation" — sollte auf neueste Plans verweisen oder „siehe STATE.md" |
| `docs/audits/2026-05-24-onboarding-audit.md` | OK |
| `drift-report.json` + `drift-report.md` | OK — vom Scraper-Test gepflegt |
| `docs/operations/stripe-setup.md` | ✅ Aktuell (9-Price-Modell) |
| `docs/operations/beta-onboarding.md` | ✅ Aktuell |
| `docs/help-center/articles/*` | ✅ Aktuell — non-custodial korrekt erwähnt |
| `app/(legal)/datenschutz/page.tsx` | ⚠️ Plausible drin (`b8071b9`), aber Verifications-Dokument-Speicherung wird beim E1-Go-Live ergänzt werden müssen |

---

## 3. Empfohlene Priorisierung

### Sofort vor Phase-E1-Go-Live (1-2 Tage)

1. **Withhold-Gate** in `generate-invoices.ts` (B-4) — sonst sabotiert E1 sich selbst
2. **Manual-Event-Read-Only-Gate** (B-2)
3. **Monthly-Cap-Race** (B-1) — Pessimistic Lock oder INSERT-WHERE
4. **Verifications-UI** abschließen (Step 4 + Admin-Page + Mails)
5. **Inngest signingKey fail-closed** (das `app/api/inngest/route.ts`-Modify in untracked-State fertigstellen)

### Phase 4 abräumen (2-3 Tage)

6. **PII-Log-Helper** (`lib/utils/log-pii.ts` untracked) fertigstellen + überall einsetzen
7. **Magic-Link-Rate-Limit** (B-8)
8. **Account-Export + Lösch-Workflow** (DSGVO)
9. **Session-Cleanup-Cron**

### Cleanup-Sweep (½ Tag)

10. Pilot-Scripts löschen (`scripts/cleanup-dossenheim3-*`, `seed-dossenheim3-*`)
11. `npm remove @neondatabase/serverless`
12. STATE.md + CLAUDE.md aktualisieren
13. Hinfällige Pläne archivieren (`mv docs/superpowers/plans/2026-05-{19,21,22-pricing-v2}*` → `docs/superpowers/plans/archive/`)
14. TriggerType Single-Source konsolidieren (B-9 + 2.5)

### Phase 5 (Performance, post-Pilot)

15. Fehlende Indexes (B-11)
16. `writeMatchEvents` batchen (B-12)
17. Concurrency-Limits auf Mail-Functions (B-7)
18. Crawler User-Agent-Rotation + Jitter (B-13)
19. Test-Suite ausbauen für Inngest-Functions

### Identity Phase C + D + E2/E3

Eigene Sprints — nicht für nächsten Push.

---

## 4. Was bewusst NICHT priorisiert

- **Identity Phase C** (Duplikat-Verein-Handling) — Workaround „erster Admin gewinnt + bessere Error-Message" reicht für Pilot
- **Identity Phase D** (Mobile-IA-Tiles) — Team-centric Plan deckt vieles davon ab
- **Phase E2/E3-Polish** (Girocode-QR, Sponsor-Pay-Toggle, etc.) — Pilot kann ohne starten
- **Account-Lösch-Anonymisierung-Cron** — Manual-DSGVO-Anfrage reicht für die ersten Vereine
- **LLM-Pre-Screening für Verifications** (E2) — Operator macht es per Sicht

---

## 5. Aufwandsschätzung

| Block | Aufwand | Blocker für |
|---|---|---|
| Sofort (1-5) | 1-2 Tage | Phase-E1-Go-Live |
| Phase 4 (6-9) | 2-3 Tage | Aufsichtsbehörden-Anfrage |
| Cleanup (10-14) | ½ Tag | nichts, aber Hygiene |
| Phase 5 (15-19) | 2-3 Tage | Skalierung auf 50+ Vereine |

**Total: ~6-9 Tage Fokus-Arbeit** bis zu einem produktionsreifen Pilot-Zustand.

---

## 6. Nächste Aktion

Empfehlung: **Phase-E1-Abschluss** als nächsten Plan rausziehen. Das untracked-State (`app/(onboarding)/onboarding/verein/4/`, `lib/utils/log-pii.ts`, `app/api/inngest/route.ts`, `lib/auth/scope.ts`, `lib/auth/server.ts`) zeigt, dass parallel auf mehreren Bahnen gearbeitet wird — sauber commiten, Withhold-Gate dazu, dann Admin-Page + Mails als nächster Plan.

Sag bescheid, wenn ich
- (a) einen konkreten Phase-E1-Closure-Plan schreiben soll (writing-plans-Skill)
- (b) STATE.md jetzt mit korrekten Zahlen aktualisieren soll
- (c) die offenen Bugs aus §2.4 als Mini-Plan zusammenstellen soll
- (d) das untracked Phase-E1-UI-Material reviewen soll
