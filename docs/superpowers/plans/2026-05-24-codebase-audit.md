# KickPact Codebase Audit — 2026-05-24

> **Auftrag (Johannes):** „Komplette Codebasis reviewen — alter vs. neuer Code, Spec-Drift, Sicherheits-, Logik-, Datenschutzrisiken, kaputte End-to-End-Prozesse, Widersprüche, offene Entscheidungen. Plan zur Behebung."
>
> Durchgeführt mit 5 parallelen Spezialagenten (Architektur, Security, Business-Logik, E2E-Flows, DSGVO+Performance).
> Quellen: `docs/superpowers/specs/2026-05-{19,22}-*.md`, Code unter `/Users/johan/kickpact/{app,lib,drizzle,tests}`.

---

## 0. Executive Summary

Es gibt **vier sofort-show-stopper**, fünf Geld-/Daten-Risiken, eine größere Architektur-Inkonsistenz und einen offenen Block aus den Identity/Pricing-Specs.

**Sofortige Show-Stopper (vor Go-Live nicht umgehbar):**

1. **Stripe-Placeholder-Bug** — kein Verein kann vom Trial in den bezahlten Plan migrieren. Onboarding schreibt `stripeCustomerId="placeholder_${clubId}"`, `createCheckoutSession()` denkt es gibt einen Customer, ruft Stripe mit dem Müll-Wert → 4xx, Checkout crasht.
2. **`/api/squad` Spielernamen-Leak** — Route prüft nur Token, kein Auth-Cookie + akzeptiert `used`/`revoked`-Tokens. Wer einen Token abfängt (Mail-Forward, Browser-History), bekommt komplette Kaderlisten — inkl. potentieller Jugendmannschaften.
3. **Impressum + Datenschutzerklärung Anschrift = `[TODO]`-Platzhalter** — § 5 TMG / Art. 13 DSGVO. Abmahnrisiko ab Tag 1 Live.
4. **Doppelter PDF-Versand + Rechnungsnummern-Race** — Inngest-Retry oder paralleler Run produzieren zweimal dieselbe Invoice-Nummer; R2-PUT überschreibt, der Sponsor bekommt eine fremde PDF im Anhang.

**Status der laufenden Spec-Arbeit:**

| Spec | Status |
|---|---|
| v1 (2026-05-19) | ~90 % implementiert. Stripe-Webhook → `team_licenses` fehlt, Cron-Cleanup (`expire-approvals`, `end-pledges`) fehlt, „Vereinslizenz" als Plan-Enum fehlt. |
| Identity-Refactor Phase A+B (2026-05-22) | Implementiert ✓ |
| Identity-Refactor Phase C (Access-Requests) | **Komplett offen** — Plan-Datei `2026-05-22-phase-c-access-requests.md` existiert, kein Code. |
| Identity-Refactor Phase D (Mobile-IA-Tiles) | **Komplett offen** |
| Pricing v2 (Saison-Pass, Vereinslizenz) | **Komplett offen** — Plan-Datei existiert, kein Code. |
| Scraper-Realdata-Validation | Implementiert ✓ |

---

## 1. Befunde nach Kategorien

### 1.1 SICHERHEIT

| Schwere | Datei:Zeile | Befund |
|---|---|---|
| 🔴 CRITICAL | `app/api/squad/route.ts:8-46` | Nur Token-Check, kein Auth-Cookie, kein Status-Filter. Spielerdaten-Leak. |
| 🔴 CRITICAL | `lib/db/queries/invitations.ts:38-43` + `schema/invitations.ts` | Sponsor-Invitations ohne `expiresAt` und ohne `status="pending"`-Filter in `findInvitationByToken`. Bereits genutzter Token kann erneut Pledges anlegen. |
| 🟠 HIGH | `app/api/stripe/webhook/route.ts:36-99` | Keine Idempotency-Tabelle für `event.id`. Bei Stripe-Retry oder reorderten Events kann älteres `updated` neueres überschreiben. `subscription.deleted` ohne `metadata.clubId` wird stumm ignoriert → Verein bleibt `active`. |
| 🟠 HIGH | `lib/actions/sponsor-inquiries.ts:229-255` | `setTeamDiscoverable` ohne Zod-Validation, `publicTagline` freitext-unbeschränkt → DB-Spam + XSS-Vector in `sponsor/discover`-Listing. |
| 🟡 MED | `lib/auth/server.ts:33-75` | Kein Rate-Limit auf Magic-Link-Requests → Spam-Mail-Versand auf User-Inboxen, Resend-Kostenangriff. |
| 🟡 MED | `app/api/inngest/route.ts` | Kein expliziter `signingKey`-Throw, wenn ENV-Var in Prod fehlt → potentiell offene Function-Triggers. |
| 🟡 MED | `lib/actions/sponsor-inquiries.ts:100-105,188-216` | Raw HTML-Interpolation von User-Input in Mail-Bodies (Sponsor-`message`, `responseMessage`). Defense-in-Depth fehlt. |
| 🟢 LOW | `app/(onboarding)/.../finalize.ts:82-83` | Slug-Suffix mit 20 Bit Entropie → DB-Konflikt-Wahrscheinlichkeit ab 1000 Vereinen ~25 %. |
| 🟢 LOW | `app/api/invoices/pdf/route.ts:31-55` | `assertClubAccess` macht `redirect()`, das vom try/catch nicht sauber als 403 kommt → kann als 500 ankommen. |

**Sicher:** Stripe-Webhook-Signature wird verifiziert, Drizzle ist überall parametrisiert, kein `dangerouslySetInnerHTML`, Magic-Link-Expiry 15 min, kein `pg`-Pool-Mismatch.

---

### 1.2 BUSINESS-LOGIK / GELD-RISIKEN

| Schwere | Datei:Zeile | Befund |
|---|---|---|
| 🔴 CRITICAL | `lib/inngest/functions/generate-invoices.ts:122,210` | `step.run`-Block umschließt INSERT **und** zwei `resend.emails.send`. Inngest-Retry → doppelte Mail mit identischer Rechnung an Sponsor & Verein. |
| 🔴 CRITICAL | `lib/invoicing/numbering.ts:5-12` | Rechnungsnummern via `COUNT(*)+1` ohne Lock. Parallele Runs → identische `KP-2026-0001`, R2-PUT überschreibt → Sponsor A erhält PDF von Sponsor B. |
| 🔴 CRITICAL | `lib/db/queries/charges.ts:85-93` + `lib/actions/approvals.ts:24-41` | Beim Crawler-Re-Run cancelled die Query auch `pending_approval` Charges, **ohne** den zugehörigen `event_approvals`-Row aufzulösen. Sponsor sieht den alten Inbox-Eintrag, klickt „Bestätigen" → cancelled Charge geht zurück auf `confirmed`. Audit-Trail-Lücke + strittige Forderung. |
| 🔴 CRITICAL | `lib/inngest/functions/crawl-matches.ts:124-149` + `evaluate-match.ts:30-39` | Bei Vereinen im Read-Only-Modus (past_due > 7 d) cancelled der Crawler bei fussball.de-Korrektur alle Charges, der Re-Eval ist aber gegated → Charges bleiben **dauerhaft auf 0**, auch nach Bezahlung. |
| 🟠 HIGH | `lib/inngest/functions/evaluate-match.ts:75-101` | Monthly-Cap-Check außerhalb DB-Transaktion. Inngest concurrency=4 → zwei parallele Matches lesen `alreadyCharged=X`, beide inserten → Cap überschritten. |
| 🟠 HIGH | `lib/actions/match-events.ts:55-64` vs `lib/crawler/team-side.ts` | Doppelte Team-Side-Detection. Manual-Event-Pfad nutzt naive `name.split(" ")[0]`-Heuristik, Crawler-Pfad nutzt `detectTeamSide()`. Vereine mit Präfix wie „Herren — FC …" werden inkonsistent klassifiziert → Charges fehlen oder gehen an falsche Mannschaft. |
| 🟠 HIGH | `lib/inngest/functions/evaluate-season.ts:53-60` | `gte(pledges.endsAt, new Date(0))` ist tautologisch. Saison-Wetten feuern für **alle** active pledges, auch wenn Pledge erst nach Saison-Ende erstellt wurde. (Explizit im `cross-saison-pledges.test.ts:212-245` reproduziert.) |
| 🟠 HIGH | `lib/inngest/functions/evaluate-season.ts:168-171` | `season_custom`-Charges landen mit `pending_approval`, aber kein `event_approvals`-Row → der Sponsor sieht nie etwas in der Inbox. Charge bleibt FOREVER pending. |
| 🟠 HIGH | `lib/db/queries/evaluation.ts:63-79` vs `generate-invoices.ts:46-49` | Monthly-Cap zählt `createdAt`, Invoice filtert `confirmedAt` → Pledge mit `monthlyCap=100€` kann durch Spät-Confirms 200€ in einem Monat in Rechnung gestellt bekommen. |
| 🟡 MED | `lib/inngest/functions/season-end-reminders.ts:1-97` | Keine Dedupe-Tabelle (TODO im Code dokumentiert). Cron läuft täglich → bis zu 30 Mails pro Pledge pro Sponsor. |
| 🟡 MED | `lib/actions/match-events.ts:152-164` | `seasonEnd` für Approval-Expiry hardcoded auf `06-30`, statt aus `pledges.endsAt` abzuleiten. Approval kann nach Pledge-Ende noch confirmed werden. |
| 🟡 MED | `lib/inngest/functions/generate-invoices.ts:91-97` | `listConfirmedChargesByPeriod` ohne Subscription-Status-Filter — Cancelled Vereine bekommen weiter PDFs. (Spec §6.8 sagt: keine neuen PDFs.) |
| 🟡 MED | `lib/inngest/functions/evaluate-season.ts:135-145` | `season_no_relegation` returnt true bei `relegated=false`-Default (auch wenn Saison noch nicht ausgewertet ist). |
| 🟡 MED | `lib/crawler/triggers.ts:160-178` | `goal_by_player` matcht case-sensitive + akzent-strikt. „Müller" ≠ „Mueller". |

---

### 1.3 ARCHITEKTUR / SPEC-DRIFT / TOTER CODE

| Schwere | Stelle | Befund |
|---|---|---|
| 🟠 HIGH | `app/api/stripe/webhook/route.ts:42-99` | Webhook schreibt **nie** in `team_licenses`. Trial → Active-Übergang nach Bezahlung wird in `team_licenses.status` nicht reflektiert. |
| 🟠 HIGH | `lib/db/schema/billing.ts:5` | `planEnum` kennt nur `basic|pro`, Code/Spec verlangen `verein`. Insert von `plan="verein"` failed. (Pricing-v2-Spec, ungelöst.) |
| 🟠 HIGH | Trigger-Eval doppelt: `evaluate-match.ts:69-101` vs `match-events.ts:67-175` | Beide laden Pledge-Rules, prüfen Cap, inserten Charges + Approvals. Manual-Event-Pfad implementiert es **inline** mit kaputter Team-Side-Detection. |
| 🟡 MED | `lib/db/schema/billing.ts:23` | Felder `billing_cycle`, `paused_until` für Sommerpause fehlen, `licenseStatusEnum` ohne `"paused"`. Pricing-v2 unimplementiert. |
| 🟡 MED | Spec v1 §5.4 + §6.9 | Crons `expire-approvals` (pending Approvals nach Ablauf auf `expired`) und `end-pledges` (Pledges mit `endsAt < now` auf `ended`) **fehlen komplett**. `season-end-reminders` ersetzt sie nicht — nur Mails. |
| 🟡 MED | `lib/triggers/labels.ts:43` vs `lib/inngest/functions/generate-invoices.ts:30-46` | `TRIGGER_META` und `TRIGGER_LABELS` zweimal definiert mit abweichenden Labels („pro Tor" vs „Pro Tor"). PDFs vs UI inkonsistent. |
| 🟡 MED | `TriggerType` dreimal deklariert: `triggers/labels.ts:7`, `crawler/triggers.ts:24`, `validations/pledge.ts:23` + `schema/pledges.ts:10` | Kein Single Source. |
| 🟡 MED | Spec v1 §6.8 fordert `clubs.master_admin_user_id`, `team_licenses.parent_club_license_id` | Beide nicht im Schema → Vereinslizenz-Cockpit nicht baubar. |
| 🟢 LOW | `lib/db/queries/sponsor-discover.ts:80 listInquiriesForTeam`, `charges.ts:98 countConfirmedChargesForSponsorClub`, `billing.ts:48 team_licenses.deactivatedAt` | Tot — kein Aufruf im Code. |
| 🟢 LOW | `scripts/cleanup-dossenheim3-charges.ts` + Geschwister | Pilot-Skripte, prüfen ob noch nötig. |
| 🟢 LOW | Schema-Saison-Format-Drift | `season_results.saison` dokumentiert `"2025/26"`, alle Aufrufe nutzen `"2526"`. Stille Mismatches bei Joins denkbar. |
| 🟢 LOW | `docs/stripe-setup.md:26-60` + `.env.example:32-33` | Dokumentiert noch alte `STRIPE_BASIC_PRICE_ID` / `STRIPE_PRO_PRICE_ID`. Aktueller Code baut `STRIPE_<PLAN>_<CYCLE>_PRICE_ID`. |

---

### 1.4 END-TO-END-FLOWS / UX-ABBRÜCHE

| Schwere | Flow | Befund |
|---|---|---|
| 🔴 CRITICAL | Trial → Paid | `finalize.ts:128` `stripeCustomerId="placeholder_…"`, `createCheckoutSession()` skipped `customers.create`, Stripe crasht. **Niemand kann zahlen.** |
| 🔴 CRITICAL | Verein-Onboarding mit bereits registriertem Verein | `finalize.ts:61` wirft hartes Error. Kein „Bei Admin anfragen"-Button. (Identity-Spec Phase C-Lücke.) |
| 🟠 HIGH | Approval-Sofort-Notification | Sponsor erfährt **erst nach 7 Tagen** über `approval-reminders` Cron, dass ein Spezial-Event auf Bestätigung wartet. `match-events.ts:159` legt Approval an, sendet aber keine Mail. |
| 🟠 HIGH | Pledge-Cancellation | UI bietet nur Pause/Reaktivieren. `setPledgeStatus` akzeptiert nur `active|paused`. Sponsor kann Pledge nicht endgültig beenden. |
| 🟠 HIGH | Trainer-Einladung | `teamMemberships`-Tabelle existiert, aber **0 Code-Pfade** zum Einladen — nur per SQL erstellbar. |
| 🟠 HIGH | Sponsoren-Einladung-Mail | `createInvitationAction` generiert nur Token, kein Mail-Send aus UI. Admin muss Link manuell kopieren. |
| 🟡 MED | Trial-Ablauf ohne Stripe-Sync | Nach Tag 0 bleibt Verein für immer im `trialing`. Kein Auto-Cancel. |
| 🟡 MED | Onboarding State-Recovery | Step-State nur in URL-Params, keine DB/Cookie-Persistierung. Verlassener User verliert alles. |
| 🟡 MED | fussball.de offline während Onboarding | Nur Toast-Error, kein „Manuell anlegen"-Fallback. |
| 🟡 MED | Sponsor-Rechnung „habe bezahlt" | Tracking-Reminder-Flow fehlt (Spec sah das vor). |
| 🟡 MED | Verein-Re-Send-Button für Rechnungen | Fehlt — wenn Sponsor Mail verloren hat, kann Verein sie nicht neu schicken. |
| 🟡 MED | Welcome-Mails | Weder nach Verein- noch nach Sponsor-Onboarding wird eine Welcome-Mail gesendet. |
| 🟡 MED | Mobile-IA-Tiles | Spec D fordert Tile-Layout; `verein/[slug]/page.tsx` ist immer noch StatCards + Tabellen. |

---

### 1.5 DSGVO / DATENSCHUTZ

| Schwere | Stelle | Befund |
|---|---|---|
| 🔴 CRITICAL | `app/(legal)/impressum/page.tsx:28-53,65` | Anschrift, PLZ/Ort, USt-IdNr, V.i.S.d.P.-Anschrift = `[TODO]`. § 5 TMG-Abmahn-Risiko. |
| 🔴 CRITICAL | `app/(legal)/datenschutz/page.tsx:29` | Verantwortlicher-Anschrift = `[TODO]`. Art. 13 DSGVO-Pflichtangabe. |
| 🔴 CRITICAL | `lib/db/schema/clubs.ts:88` + `lib/db/queries/crawler.ts:upsertPlayer` | Spielernamen (potentiell Minderjährige) werden persistiert ohne dokumentierte Rechtsgrundlage in Datenschutzerklärung. Kein Opt-out-Mechanismus für Spieler. |
| 🟠 HIGH | `datenschutz/page.tsx:97-160` | „AV-Verträge mit allen Anbietern" — kein Subprocessor-Listing, keine SCCs/TIA-Hinweise für Stripe/Resend/Inngest (US-Drittland). |
| 🟠 HIGH | Kein DSGVO-Datenexport (Art. 15/20), kein Account-Lösch-Flow | Grep ergibt 0 Treffer. Spannungsfeld § 147 AO (10 J) vs Art. 17 nicht aufgelöst. |
| 🟡 MED | PII in Logs: `lib/auth/server.ts:65,70`, `generate-invoices.ts:259,294`, `trial-reminders.ts:87` | E-Mail-Adressen + Vereinsnamen ungetruncated in Coolify/Inngest-Logs. |
| 🟡 MED | `lib/db/schema/auth.ts:13-22` | `sessions.ipAddress` + `userAgent` werden gespeichert; Aufbewahrungsfrist (Cleanup-Cron) nicht implementiert. |
| 🟡 MED | `lib/db/schema/clubs.ts:28` `clubs.iban` | Wird gehalten, aber nicht in DSE als Datenkategorie aufgeführt. |
| 🟢 LOW | Cookie-Banner | Nicht benötigt (nur Session-Cookie). Wenn Analytics dazukommt → einplanen. |

---

### 1.6 PERFORMANCE / EFFIZIENZ

| Schwere | Stelle | Befund |
|---|---|---|
| 🔴 CRITICAL | `lib/crawler/fussballde.ts:528-533` + Cron `0 */6 * * *` | Statischer User-Agent, kein Jitter, kein IP-Wechsel, kein adaptiver Backoff. 4× pro Tag × 50 Teams → fussball.de-Bann-Risiko. |
| 🔴 CRITICAL | `lib/db/queries/crawler.ts:206-245 writeMatchEvents` | N+1 — pro Event ein `upsertPlayer` + ein `insert(matchEvents)`. Bei 50 Teams × 30 Spielen ≈ 30 000 Roundtrips pro Crawl. |
| 🟠 HIGH | `lib/db/schema/*` | Fehlende Indexes: `charges(match_id)`, `charges(invoice_id)`, `invoice_items(invoice_id)`, `invoice_items(charge_id)`, `players(team_id)`, `club_memberships(user_id)`, `event_approvals(match_event_id)`, `sponsor_invitations(status)`. |
| 🟠 HIGH | `lib/inngest/functions/*` ohne `concurrency`-Begrenzung: `evaluate-season`, `generate-invoices`, `approval-reminders`, `season-end-reminders`, `trial-reminders` | Bei vielen Vereinen parallel DB-/Resend-Hammer. |
| 🟡 MED | `lib/db/queries/club-dashboard.ts:120` | Korrelierte SUM-Subquery pro Pledge-Row → linearer Mehraufwand. Lateral Join / GROUP BY effizienter. |
| 🟡 MED | Crawler-Cron `0 */6 * * *` | Für Amateurfußball (Spiele Sa/So) 1×/Tag nachts ausreichend. Quote-Verbrennung. |
| 🟡 MED | `package.json` enthält `@neondatabase/serverless` ungenutzt | Bundle-Bloat + Driver-Inkonsistenz mit `postgres-js` in `db/client.ts`. |
| 🟢 LOW | `lib/invoicing/builder.tsx` | Nicht mit `import "server-only"` markiert → Drift-Schutz für Bundle. |

---

### 1.7 OFFENE ENTSCHEIDUNGEN / WIDERSPRÜCHE

1. **„Vereinslizenz"-Pricing (Pricing-v2-Plan)** — Pflichtfeature, aber komplett unimplementiert. Welche Tabellen, welche Migration-Strategie für bestehende Team-Lizenzen?
2. **Identity-Phase C (Access-Requests)** — Plan existiert seit 2 Tagen, aber Onboarding wirft heute hart. Soll das jetzt vor Go-Live umgesetzt werden oder akzeptierst du den Workaround „erster Admin gewinnt"?
3. **Aufbewahrungsfristen vs Art. 17 DSGVO** — Wie lange werden Invoices, Charges, Spielernamen nach Account-Löschung gehalten? Steuerlich 10 J, datenschutzrechtlich „so kurz wie möglich". Brauche eine schriftliche Policy.
4. **Spieler-Opt-out** — Bekommt ein Spieler einen Mechanismus, seine Aufnahme in `players`/`match_events` zu verbieten? Ohne diesen Punkt ist die fussball.de-Persistierung DSGVO-fragil.
5. **Trial-Ende-Verhalten** — Nach Tag 0: Read-Only (Verein sieht Dashboard, neue Pledges blockiert) oder hartes Abschalten?
6. **„season_custom"-Trigger** — Sollen die approval-pflichtig sein (dann Inbox-Eintrag) oder auto-confirmed (dann anders im Schema markieren)? Aktuell weder noch.

---

## 2. Fix-Plan in 5 Phasen

Jede Phase ist in sich konsistent abschließbar. Phase 1 ist Go-Live-Blocker, Phase 2 sind Geld-Risiken, Rest ist priorisiert nach Impact.

### Phase 1 — Show-Stopper für Go-Live (1–2 Tage)

Ohne diese Phase keinen einzigen echten Verein onboarden.

- **1.1 Stripe-Placeholder-Bug fixen**
  - `app/(onboarding)/onboarding/verein/_actions/finalize.ts:128`: `stripeCustomerId: null` (Schema `notNull` ggf. nullable machen oder Customer in `finalize` erzeugen)
  - `lib/actions/subscriptions.ts createCheckoutSession`: `if (!customerId || customerId.startsWith("placeholder_"))` → echten Customer anlegen
  - Test mit Stripe-Sandbox: Onboarding → Checkout → Webhook → `subscriptions.status="active"`

- **1.2 `/api/squad` absichern**
  - `app/api/squad/route.ts`: zusätzlich `requireUser()` ODER `assertSponsorAccess()`
  - `invitations.ts findInvitationByToken`: `where(eq(sponsorInvitations.status, "pending"))`
  - Schema: `expiresAt: timestamp(...).notNull()` mit Default `now() + 30 days`, Migration für bestehende Tokens

- **1.3 Impressum + Datenschutzerklärung Anschriften ausfüllen**
  - Alle `[TODO]`-Platzhalter durch echte Anschrift + USt-IdNr ersetzen
  - DSE: Subprocessor-Liste (Stripe IE/US, Resend US, Inngest US, Neon US, Hetzner DE, fussball.de) als Tabelle mit Sitz, Zweck, AV-Status, SCC-Status

- **1.4 fussball.de-Spielerdaten-Block in DSE**
  - Abschnitt mit Rechtsgrundlage Art. 6 lit. f, Interessenabwägung („öffentliche Sportereignisse, ohne diese kein KickPact"), Speicherdauer, Widerspruchsweg (Mail an Datenschutz-Kontakt)
  - Schema: `players.blocked: boolean` Spalte für Opt-out (Crawler überspringt)

**Test-Plan Phase 1:** `npm run build` + manueller Smoke-Test Onboarding-Path mit Stripe-Sandbox + Squad-Endpoint via curl ohne Cookie.

---

### Phase 2 — Geld-Risiken & Datenintegrität (3–5 Tage)

- **2.1 Invoice-Nummerierung race-safe**
  - Drizzle-Migration: `CREATE SEQUENCE invoice_seq_{year} START 1;` pro Jahr, oder eigene Tabelle `invoice_counters (club_id, year, counter)` mit `SELECT FOR UPDATE`
  - `lib/invoicing/numbering.ts`: in DB-Transaktion mit `pg_advisory_xact_lock(...)`

- **2.2 Invoice-Mail-Send aus Step-Block ziehen**
  - `lib/inngest/functions/generate-invoices.ts`: ein `step.run("create-invoice", …)` (idempotent durch UNIQUE), danach **separate** `step.run("send-mail-${invoiceId}", …)` für jeden Mail-Versand
  - Inngest-Retry triggert dann nur den fehlgeschlagenen Step erneut

- **2.3 Cancelled-Charge-Wiederbelebung blockieren**
  - `lib/db/queries/charges.ts:85-93 invalidateChargesForMatch`: gleichzeitig `update(eventApprovals).set({status:"expired"}).where(...)` für betroffene Approvals
  - `lib/actions/approvals.ts confirmApproval`: vor State-Transition prüfen `if (charge.status === "cancelled") throw "Ereignis wurde inzwischen widerrufen"` + UI-Hinweis

- **2.4 Read-Only-Gate symmetrisch**
  - `lib/inngest/functions/crawl-matches.ts`: vor `invalidateChargesForMatch` `isReadOnly`-Check; bei Read-Only nur in `match_drift_alerts`-Tabelle protokollieren, nicht löschen

- **2.5 Monthly-Cap atomisch + konsistent**
  - `lib/db/queries/evaluation.ts getMonthlyChargedCents`: auf `confirmedAt` umstellen (gleicher Filter wie `generate-invoices`)
  - `lib/inngest/functions/evaluate-match.ts`: Insert mit `INSERT ... WHERE (SELECT SUM(...) FROM charges WHERE ...) + amount <= cap` ODER pessimistic lock pro Pledge

- **2.6 Saison-Trigger reparieren**
  - `lib/inngest/functions/evaluate-season.ts:53-60`: `gte(pledges.endsAt, new Date(0))` → korrekt `gte(pledges.endsAt, seasonStart)` + `lte(pledges.startsAt, seasonEnd)`
  - `season_custom`-Charges: entweder eigenes Approval-Mechanism (synthetisches MatchEvent oder eigene Tabelle) **oder** auto-confirmed mit Hinweis in DSE
  - `season_no_relegation`: nur prüfen wenn `season_results.evaluatedAt IS NOT NULL`

- **2.7 Team-Side-Detection zentralisieren**
  - `lib/actions/match-events.ts:55-64` ersetzt durch Aufruf von `detectTeamSide()` aus `lib/crawler/team-side.ts`
  - Tests beider Pfade gegen denselben Fixture-Datensatz

**Test-Plan Phase 2:** Integration-Tests für jede Race-Condition (parallel-Inngest-Simulation), Re-Scrape mit Score-Korrektur, Sponsor-Approval nach Cancellation.

---

### Phase 3 — Stripe-/Subscription-Lifecycle End-to-End (3–4 Tage)

- **3.1 Stripe-Webhook Idempotency**
  - Neue Tabelle `processed_stripe_events (event_id PK, processed_at)`
  - `app/api/stripe/webhook/route.ts`: `INSERT ... ON CONFLICT DO NOTHING` als Gate

- **3.2 `team_licenses` synchron halten**
  - Webhook bei `subscription.created/updated/deleted` zusätzlich `team_licenses.status` setzen
  - `subscription.deleted` ohne `metadata.clubId` per `stripeCustomerId`-Fallback auflösen

- **3.3 Trial-Ende Cron**
  - Neue Inngest-Function `expire-trials.ts` (täglich): `subscriptions WHERE status='trialing' AND trial_ends_at < now AND stripe_subscription_id IS NULL` → `status='canceled'`, Mail „Trial abgelaufen — bitte Plan wählen"
  - Read-Only-Gate in `subscription-status.ts gateFromSubscription` muss `canceled` als read-only behandeln

- **3.4 Pledge-Lifecycle-Crons (Spec §5.4 + §6.9)**
  - `expire-approvals.ts` (täglich): `event_approvals WHERE status='pending' AND expires_at <= now` → `status='expired'`, zugehörige Charges → `cancelled`
  - `end-pledges.ts` (täglich): `pledges WHERE status='active' AND ends_at < now` → `status='ended'`
  - Cleanup-Mails konsolidieren mit `season-end-reminders`

- **3.5 `season-end-reminders` Dedupe**
  - Tabelle `sent_notifications (kind, pledge_id, sent_at)` als Dedupe-Key
  - Vor Send: `INSERT … ON CONFLICT DO NOTHING`, nur senden bei Erfolg

- **3.6 Pledge-Cancellation (Sponsor)**
  - `lib/actions/pledges.ts setPledgeStatus`: `"ended"` als Wert erlauben (mit Bestätigungs-Dialog im UI)
  - Sponsor-Pledge-Detail-Seite: roter „Endgültig beenden"-Button

---

### Phase 4 — DSGVO-Vollständigkeit & Operationelle Reife (2–3 Tage)

- **4.1 Account-Export (Art. 15/20)**
  - Server-Action `requestDataExport()`: stellt JSON aller User-Daten zusammen (User, Memberships, Pledges, Charges, Invoices, Approvals), per Resend als Attachment
  - Sponsor-Profil-Seite: „Daten herunterladen"-Button

- **4.2 Account-Löschung (Art. 17)**
  - Server-Action `requestAccountDeletion()`: User auf `deletion_requested_at` markieren, Mail-Bestätigung
  - Cron `process-account-deletions.ts` (täglich): 14 d nach Request → anonymisieren (Emails → Hash, Names → „Gelöschter Nutzer"), Steuer-Aufbewahrungsfristen für Invoices bleiben
  - DSE entsprechend ergänzen

- **4.3 PII in Logs maskieren**
  - Helper `lib/utils/log-pii.ts maskEmail()` (z.B. `j**@e**.com`)
  - Grep+Replace in allen `console.log`/`logger.info` mit `to:`, `email:`, `clubName:`

- **4.4 Session-Cleanup-Cron**
  - Inngest-Cron `cleanup-sessions.ts` (täglich): `DELETE FROM sessions WHERE expires_at < now - interval '30 days'`

- **4.5 Magic-Link-Rate-Limit**
  - `lib/auth/server.ts`: `rateLimit: { window: 60, max: 5 }` in betterAuth-Config

- **4.6 Inngest-`signingKey` fail-closed**
  - `app/api/inngest/route.ts`: bei `NODE_ENV='production'` und fehlendem `INNGEST_SIGNING_KEY` → throw beim Start

---

### Phase 5 — Performance, Konsistenz, fehlende UX (2–3 Tage)

- **5.1 Index-Migration**
  - Eine Drizzle-Migration mit allen fehlenden Indexes (charges/invoice_items/players/club_memberships/event_approvals/sponsor_invitations)

- **5.2 `writeMatchEvents` batchen**
  - `lib/db/queries/crawler.ts:206-245`: `db.insert(players).values(allPlayers).onConflictDoNothing()` + `db.insert(matchEvents).values(allEvents)`
  - Crawler-Cron auf `0 3 * * *` (1×/Tag nachts), User-Agent-Rotation aus 5er-Liste, `waitForTimeout(Math.random()*2000 + 1000)` als Jitter

- **5.3 Inngest-Concurrency überall setzen**
  - Default `{ limit: 5 }` für alle Functions ohne explizites Limit

- **5.4 Trigger-Definitionen vereinheitlichen**
  - Eine Datei `lib/triggers/types.ts` exportiert `TriggerType`, `TRIGGER_META` (mit Label, Emoji, Scope, Auto/Manual/Season)
  - `crawler/triggers.ts`, `validations/pledge.ts`, `generate-invoices.ts` importieren von dort
  - `schema/pledges.ts triggerTypeEnum` bleibt einzige DB-Quelle, TS-Typ leitet aus dem Enum ab

- **5.5 Sponsoren-Einladung per Mail**
  - `lib/actions/invitations.ts createInvitationAction`: optional `email`-Feld, ruft `resend.emails.send` mit Template `mail/templates/sponsor-invitation.tsx`

- **5.6 Approval-Sofort-Mail**
  - `lib/actions/match-events.ts addManualEvent`: nach Approval-Insert → Inngest-Event `approval/created` → Function sendet Mail an Sponsor mit Bestätigungs-Link

- **5.7 Welcome-Mails**
  - Verein-Welcome (nach `finalizeOnboarding`) + Sponsor-Welcome (nach Pledge-Anlage)

---

## 3. Was bewusst NICHT im Plan ist

- **Identity Phase C (Access-Requests):** eigene Plan-Datei `2026-05-22-phase-c-access-requests.md` existiert. Sollte als eigener Sprint laufen, **nachdem** Phase 1 oben den hart-throw entschärft hat (Notfall-Workaround: bessere Fehlermeldung mit „Mail an support@" statt 500).
- **Identity Phase D (Mobile-IA-Tiles):** eigener Sprint.
- **Pricing v2 (Vereinslizenz, Saison-Pass):** eigener Sprint nach Strategieentscheidung (siehe offene Frage 1).
- **Performance-Mikro-Optimierungen** (Dashboard-Caching, Lateral Joins) → erst wenn DB-Load real wird.

---

## 4. Aufwandsschätzung (sehr grob)

| Phase | Aufwand | Blocker für |
|---|---|---|
| 1 — Show-Stopper | 1–2 Tage | Go-Live |
| 2 — Geld-Risiken | 3–5 Tage | Erster echter Sponsor |
| 3 — Subscription-Lifecycle | 3–4 Tage | Erste Trial-Konversion |
| 4 — DSGVO-Vollständigkeit | 2–3 Tage | Aufsichtsbehörden-Anfrage |
| 5 — Performance/UX | 2–3 Tage | 50+ Vereine Scale |

**Gesamt: ~11–17 Tage Fokus-Arbeit** bis zu einem produktionsreifen Zustand.

---

## 5. Nächste Aktion

Empfehlung: Phase 1 sofort als einzelnen Plan rausziehen (`docs/superpowers/plans/2026-05-24-phase1-go-live-blockers.md`), ich nutze dafür die `writing-plans`-Skill und bringe es in TDD-Schritte. Sag bescheid, ob ich das anschließe oder erst auf deine Priorisierung warten soll.
