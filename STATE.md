# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.
> Letztes Konsolidieren: 2026-06-12 — Audit-Umsetzung (6 Phasen) + Saison-Features 26/27 (W1–W4).

## Stand

- **Branch:** `main` (synced)
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push, post_deploy `npm run db:migrate`)
- **Aktuelle Saison: 26/27** — am 12.06. per `scripts/season-rollover-now.ts --execute` alle 9 aktiven Teams von 2526 → 2627 gebumpt (Sofort-Umstellung, User-Wunsch). 25/26-Spiele bleiben sichtbar über den Saison-Switcher. Der reguläre `season-rollover`-Cron (15.7.) ist idempotent und findet danach 0 Teams mehr auf 2526.
- **Production-Domain kickpact.com:** DNS bewusst NOCH NICHT gesetzt (User-Entscheid: „erst live wenn's läuft"). Code-seitige Domain-Fallbacks zeigen auf kickpact.com (lib/utils/base-url.ts).
- **Migrationen:** bis 0059 (Phase 5: billing_cycle/license_transfers/pay-links/Vereinsprofil; 0059: trigger_type += home_win/away_win). Journal-when-Kette monoton bis 1782460000000.
- **Test-Infra:** FK-Seeding-Flake im Volllauf 2026-07-06 an der Wurzel gefixt — `tests/setup/db.ts resetTestDb` war eine Kette aus 34 sequentiellen DELETEs, die nach einem Test-Timeout als Zombie in die nächste Datei blutete (Teams verschwanden mitten im Seed → FK-Fehler). Jetzt EIN atomares `TRUNCATE … CASCADE` (Muster aus integration-db.ts). Volllauf seither deterministisch grün (1467 Tests). Rest-Risiko: sehr seltener OOM-Abbruch (Exit 137) im singleFork-Volllauf → dann batchweise pro Verzeichnis nachlaufen. Pool-Größen im Test: lib/db/client.ts max=8, integration-db max=5, je idle_timeout=5; Test-Container max_connections=400.

## Privatpersonen-only Sponsoring (2026-07-06)

**Strategie-Pivot (User-Entscheid):** Sponsoren sind ausschließlich Privatpersonen (Familie, Freunde, Fans) — kein Business/Gewerbe mehr, komplett aus Messaging, UI, Onboarding und Dokumenten. Spec: `docs/superpowers/specs/2026-07-06-privatpersonen-only-sponsoring.md` (inkl. Steuer-Recherche: Privatbeiträge ohne Gegenleistung = Spende, ideeller Bereich, keine USt).

- **Onboarding:** Typ-Wahl („Familie vs. Unternehmen") entfällt; Business-Formularfelder gelöscht; `create-sponsor` schreibt hart `type='familie'`. Enum-Wert `business` bleibt INERT (annual-Muster), Business-Spalten bleiben nullable, 0 Bestandsdaten (verifiziert).
- **Dokument-Reframing:** Sponsor-PDF heißt **„Zahlungsübersicht"** (Storno: „Stornobeleg"), **kein USt-Ausweis/Aufschlag mehr** (§14c-Risiko, Spendenframing) — `totalCents` = Summe der zugesagten Beiträge. Sponsor-Mails/UI-Labels umbenannt (Route `/sponsor/rechnungen` bleibt).
- **Copy-Sweep:** Landing (Story-Cards, Benefits, FAQ), Preise-FAQ, Willkommen-Wizard, Einladungsseite — „lokale Firmen/Werbeleistung/absetzbar" raus, Privat-Personas rein. Steuer-FAQ neutral (Spende nur via gemeinnützigem Verein, kein pauschales Versprechen).
- **Bleibt:** Postvorlagen/Share-Bilder (Recap/Wrapped) als Marketing-Kanal; `sponsor_leads`; Vereins-Stammdaten (USt betrifft nur Lizenz Verein↔KickPact).
- **Phase 2 (offen, separater Plan):** Gemeinnützigkeits-Flag + „vereinfachter Nachweis ≤300 €"-Baustein + Spendenübersicht.

## Audit-Umsetzung 2026-06-11/12 (alle 6 Phasen gemerged)

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Sommerpause-Charge-Lücke (pausedAt-Semantik, evaluation-Filter, endPledges) + Repair-Script | ✅ deployed; Juni-Reparatur war No-Op (0 Pledges auf Staging) |
| 2 | Geld-Integrität: Stripe-Doppelabo-Fix, payment_method_types raus, trial_end statt Reset, Webhook (Marker-nach-Erfolg, authoritative Re-Fetch, invoice.paid-Guard), pastDueSince, Saison-Pass keep_as_draft, Basic-Downgrade-Enforcement, Cap-Anker=Abrechnungsmonat, results_only-Doppelcharge-Guard, Read-Only-Gate nur past_due/cancelled/trial_expired/incomplete, Approval-Row-Restauration, Rechnungslauf draft→sent nach Mail, Phantom-Tor-Deckel, halb-offene Perioden, season-idx ohne cancelled, Builder-Param-Validierung, season_custom-Approval-Flow (Direkt-Charge-Confirm + Inbox-Sektion + 21d-Expiry), Hattrick/Comeback-Approval bei manueller Evidenz, getBaseUrl() | ✅ |
| 3 | Saisonstart 26/27: **Saison-Bump-Architektur** (Cron 15.7. bumpt teams.saison in-place), Renewal-Clone-Provenance (clonedFromPledgeId + Unique-Index), seasons-Seed-Migration (2526/2627/2728), computeTrialEndsAt (Trial = max(now+30d, Saisonstart+30d), 70d-Horizont), Crawling trotz Trial-Ende, Renewal-Mails konsolidiert (Stages 30/14/3, 1-Click-HMAC), **Vorsaison-Backfill via ajax.team.matchplan** (ganze Saison in 1 Request, score-font-dekodiert) + backfill-team-history + Onboarding-Hook (<3 gespielte), „Letzte Saison"-Block (Team-Dashboard + /m/), Saison-Ergebnis-Resolver (Vorsaison bis 1.10.), Recap verlinkt | ✅ |
| 4 | Journey/UX: Push-Deeplink Sponsoren→/m/, Wizard-onInvalid, Sommerpause-Badge, Coverage-Kommunikation (none-Teams onboardbar, alles manuell + Sponsor-Approval erzwungen), Check A verdrahtet, Spezialtor-Mirror + Server-Validierung (auch Edit), Mitglieder-Invite-Mail, Team/Verein verlassen, Terminologie-Sweep (Wette/Charge/Pledge raus), Empty-State-Offensive (Verein-„Nächste Schritte"), Kontrast /40→/60 + Pill-Sweep, eur()-Helper, Sitemap+Title+og, /status token-gegated | ✅ |
| 5 | V1-Features: **Sponsor-Billing-Cycle** (monthly/season_end, History+Snapshot, Saisonende-Rechnungslauf 1.7., Wechsel-Regeln inkl. K1-Fix), **Lizenz-Transfer** (Spec §1.5: Anfrage→T entscheidet, Branding sofort via licensedUnderClubId, Stripe cancel_at_period_end, Flip-Cron; Rechnung gehört dem Billing-Club), **Pay-Links** (PayPal.Me+Stripe-Link auf PDF/Mail, injection-sicher), **Vereins-Public-Profil /v/[slug]** (verifiedAt-Gate, Pflege-UI, Sitemap), **Zahlungserinnerungs-Vorlage** (Copy/mailto, KEIN Auto-Versand — User-Entscheid statt Spec-§1.11-Mahncron) | ✅ |
| 6 | Reviews: jede Phase adversarial reviewed (Befunde K1–K3/M1–M7 etc. gefixt) | ✅ |

## Saison-Features 26/27 (2026-06-12, gemerged + deployed)

| Paket | Inhalt | Status |
|---|---|---|
| W1 | **26/27 überall** (Sofort-Bump, Label-Sweep) + **Saison-Switcher** (Pills auf Spiele-Listen/Team-Dashboard/öffentl. Profil, Anzeige-Saison via ?saison=, Charges/Stats bleiben aktuell) + Wett-Fenster folgt `team.saison` (getSeasonWindowForTeam) | ✅ |
| W2 | **Heim-/Auswärtssieg** als zwei eigene Trigger-Typen (`home_win`/`away_win`, Migration 0059, eigene Beträge, Auswärts höher bewertbar; feuert zusätzlich zu `win` — gewollt) | ✅ |
| W3 | **Geld-Simulation** (`lib/simulation/pact-simulation.ts` — echte evaluateTriggers-Engine über Vorsaison-Spiele): Builder-Panel „hättest du letzte Saison X € beigetragen" (Conversion) + Team-Dashboard-Prognose (Rückblick + Hochrechnung laufende Saison) | ✅ |
| W4 | **Saison-Wrapped** (Spotify-Stil): durchswipebarer Story-Player `…/mannschaft/[teamId]/wrapped` (Tore/Bilanz/bester Torschütze/Zu-Null/Comebacks/Heim-Auswärts/höchster Sieg/Pacts ODER Simulation/Outro), 9:16-Share-Bilder via next/og pro Slide, Entry-Karte im Dashboard | ✅ |

**Bewusste Saison-Feature-Entscheidungen (User 2026-06-12):** Umstellung SOFORT (nicht 15.7.) · Heim/Auswärts = zwei eigene Regel-Typen · Voll-Wrapped mit Slides · Simulation auch im Builder. Wrapped-Fallback-Slide nutzt einen schmalen goal_total-Adapter (`lib/recap/wrapped-simulation.ts`), nicht den vollen Sim-Kern (dokumentiert).

## Bewusste Entscheidungen (User, 2026-06-11)

- Trial: bis in die Saison hinein, 30 Tage IN der Saison kostenlos.
- KEINE automatischen Mahnungen — Verein erzeugt sich Erinnerungs-Vorlagen selbst.
- Season-End-Rechnung geht an den Sponsor (eine Rechnung am 30.06.).
- Saison-Übergang = Bump auf derselben Team-Row (nicht Row-Klonen) — Begründung: FK-Geflecht (Lizenzen, Memberships, publicSlug, Bilder).
- kickpact.com-DNS erst nach Live-Freigabe durch Johannes.

## Feature-Status (Delta zu 2026-05-28 — alles davor Gelistete bleibt live)

| Feature | Status |
|---|---|
| iOS-Push (APNS) | ✅ Code komplett; echte APNS-Keys in Coolify noch Platzhalter |
| Operator-Admin-Panel (Phasen A–J) | ✅ |
| Profil-Redesign (/m/, Discovery) + /v/[slug] Vereinsprofil | ✅ |
| Referral-Share (F1) + Saison-Recap (F3, jetzt verlinkt) | ✅ — Attribution (F2) + Verein-wirbt-Verein weiter ungebaut |
| Saisonstart-Paket 26/27 | ✅ (Checkliste unten) |
| Sponsor-Billing-Cycle + Lizenz-Transfer + Pay-Links | ✅ neu (Phase 5) |

## Saisonstart-Checkliste 2026/27 (Betreiber)

Automatisch: Crawler-Pause endet 15.7. · season-rollover-Cron bumpt 15.7. die Saison · Pledge-/Saison-Pass-Resume 1.8. · Renewal-Mails 30/14/3 Tage mit 1-Click-Link · Onboarding-Backfill lädt Vorsaison-Spiele.
Manuell: (1) seasons-Rows kommen via Migration 0055 — nach Spielplan-Veröffentlichung `matchdayFiveAt` der 2627-Row gegen den echten 5. Spieltag prüfen (DB-Studio). (2) Ab 15.7. Stichprobe /admin/crawler (Captcha-Häufung?). (3) Werbe-Onboardings ab Juni ok — Trial endet frühestens 30 Tage nach Saisonstart.

## Go-Live TODO — Stripe (vor Production-Launch)

> Test-Mode Sandbox „Eventapp Sandbox". Abo-Modell (`mode: subscription`) → Klarna/Sofort unmöglich.

- [ ] Live-Account aktivieren (Geschäftsdaten, Auszahlung).
- [ ] Zahlungsmethoden im Live-Mode aktivieren (Karte, SEPA-Lastschrift, PayPal, Link, Apple/Google Pay).
- [ ] 6 Price-IDs im Live-Mode anlegen (Basic/Pro/Verein × Monthly/Saison).
- [ ] Live-Webhook-Endpoint + neues `whsec_…`.
- [ ] Env auf Live umstellen (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID`).
- [x] ~~payment_method_types nicht hart setzen~~ — Audit 2026-06-11: WAR hart gesetzt, in Phase 2 entfernt (Dynamic Payment Methods).
- [ ] SEPA-Settlement via invoice.paid-Webhook verifizieren.
- [ ] kickpact.com: DNS-A-Record (CF), `NEXT_PUBLIC_BASE_URL`/`NEXT_PUBLIC_SITE_ENV=production` setzen, robots/sitemap-Verhalten prüfen.
- [ ] APNS-Live-Keys für iOS-Push.

## Go-Live TODO — Apple IAP (Branch `feat/apple-iap-entitlements`)

> Backend komplett + getestet (322 Tests grün) + adversarial reviewed. Zwei Bezahlkanäle
> (Stripe Web + Apple IAP) schreiben in EIN Entitlement-Gate; Kanal-Invariante verhindert
> Doppel-Abo. Code ist web-inert ohne Credentials — bis die Env gesetzt ist passiert nichts.
> Spec: docs/superpowers/specs/2026-06-16-apple-iap-entitlements-design.md

**Erledigt (per ASC-API, Script `scripts/create-asc-iap-products.mjs`):** 6 IAP-Produkte +
Subscription-Gruppe „KickPact Pläne" (22159886) + de-DE-Localizations. App-ID 6780505599.

**Manuell (Johannes, vor Launch):**
- [ ] **6 Start-Preise im ASC-UI setzen** (Apple-Pricing-API verbuggt): basic.monthly 4,99 € ·
      basic.season 34,99 € · pro.monthly 10,99 € · pro.season 74,99 € · verein.monthly 28,99 € ·
      verein.season 199,99 €.
- [ ] **App Store Server Notifications V2 URL** in ASC eintragen → `/api/apple/notifications`
      (Sandbox + Production getrennt).
- [ ] **Coolify-Env setzen** (alle web-inert bis gesetzt):
      `APPLE_IAP_BUNDLE_ID=com.kickpact.app`, `APPLE_IAP_ENV=sandbox` (später production),
      `APPLE_IAP_APP_APPLE_ID=6780505599`, `APPLE_IAP_ROOT_CERTS` (Apple Root CA G3 als base64-PEM,
      komma-sep — für JWS-Verifikation), sowie für den Reconciliation-Cron die ASC-API-Keys:
      `APPLE_IAP_KEY_ID=VP65CLK9FZ`, `APPLE_IAP_ISSUER_ID=c3a68526-ca02-41cf-a5c7-e438c1ed939f`,
      `APPLE_IAP_PRIVATE_KEY` (Inhalt der AuthKey_VP65CLK9FZ.p8 inkl. BEGIN/END).
- [ ] **TestFlight-Build** mit dem neuen `IAPPlugin` (Xcode: In-App-Purchase-Capability auf der
      App-ID aktivieren, signieren, hochladen). Simulator-Build kompiliert bereits (BUILD SUCCEEDED).
- [ ] **Sandbox-Abnahme** (echtes Gerät): Kauf je Plan → Entitlement aktiv · `restore()` nach
      Neuinstallation · Sandbox-Refund → Read-Only · Anti-Steering visuell (keine Web-Preise/Stripe
      in der App).

**Bewusst v1-Backlog (dokumentiert, kein Blocker):** kein Kanal-Wechsel Stripe↔Apple für einen
bestehenden Club · Android/Play-Billing (`'google'`-Enum inert reserviert) · Saison-Pässe im
In-App-Upsell (vorerst monthly-only, season bleibt web) · TOCTOU im provider=null-Trial-Fenster
(theoretisch, durch UNIQUE-Constraints begrenzt).

## Tests

`npm test` (batchweise pro Verzeichnis): **1387 passed / 42 skipped (171 Files)** · `tsc --noEmit` clean · Stand 2026-06-12.
**CI komplett deaktiviert (2026-07-19, Actions-Minuten):** beide Jobs in `.github/workflows/ci.yml` stehen auf `if: false`. `unit-integration` lief zuvor mit `continue-on-error: true` und 69 bekannten Failures — 814 GitHub-Actions-Minuten pro Abrechnungszyklus für ein Ergebnis, das nichts geblockt hat. `e2e` war schon länger aus (Specs referenzieren den alten 5-Step-Wizard). **Heißt: aktuell kein CI-Gate auf main — lokal `npm test` + `tsc --noEmit` vor jedem Merge.** Re-Aktivierung erst mit dem Proper-Fix (~3-4h: Tests in `db.transaction(...)` wrappen, einheitlich auf `integration-db.ts`, Mail-Client lazy, Parser-Fixtures als statisches JSON), dann ohne `continue-on-error`.

Test-Infra: singleFork-Volllauf über alle 171 Dateien OOMt/deadlockt (Vitest instanziiert lib/db/client + integration-db pro Datei neu → Pool-Akkumulation). Batchweise laufen: `npm test -- tests/queries tests/lib tests/simulation` etc. Pools begrenzt (client max=8, integration-db max=5, je idle_timeout=5s), Test-Container max_connections=400.

## Spec-Referenzen

- **Primary:** docs/superpowers/specs/2026-05-26-v1-final-scope-consolidation.md
- **Audit-Pläne:** docs/superpowers/plans/2026-06-11-audit-umsetzung-master.md (+ Phase 1–5 Pläne)
- **Offene Spec-Gaps (bewusst Backlog):** Referral-Attribution (F2), Verein-wirbt-Verein, Soft-Delete clubs/teams, Notification-Mail-Präferenzen (Digest), strukturierte Saisonziele mit Auto-Check, Graceful-Downgrade-Pause (F4).
