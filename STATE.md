# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.
> Letztes Konsolidieren: 2026-06-12 — Komplett-Audit-Umsetzung (6 Phasen, Audit 2026-06-11).

## Stand

- **Branch:** `main` (synced)
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push, post_deploy `npm run db:migrate`)
- **Production-Domain kickpact.com:** DNS bewusst NOCH NICHT gesetzt (User-Entscheid: „erst live wenn's läuft"). Code-seitige Domain-Fallbacks zeigen auf kickpact.com (lib/utils/base-url.ts).
- **Migrationen:** bis 0058 (Phase 5: billing_cycle, license_transfers, pay-links, Vereinsprofil-Felder). Journal-when-Kette monoton bis 1782450000000.

## Audit-Umsetzung 2026-06-11/12 (alle 6 Phasen gemerged)

| Phase | Inhalt | Status |
|---|---|---|
| 1 | Sommerpause-Charge-Lücke (pausedAt-Semantik, evaluation-Filter, endPledges) + Repair-Script | ✅ deployed; Juni-Reparatur war No-Op (0 Pledges auf Staging) |
| 2 | Geld-Integrität: Stripe-Doppelabo-Fix, payment_method_types raus, trial_end statt Reset, Webhook (Marker-nach-Erfolg, authoritative Re-Fetch, invoice.paid-Guard), pastDueSince, Saison-Pass keep_as_draft, Basic-Downgrade-Enforcement, Cap-Anker=Abrechnungsmonat, results_only-Doppelcharge-Guard, Read-Only-Gate nur past_due/cancelled/trial_expired/incomplete, Approval-Row-Restauration, Rechnungslauf draft→sent nach Mail, Phantom-Tor-Deckel, halb-offene Perioden, season-idx ohne cancelled, Builder-Param-Validierung, season_custom-Approval-Flow (Direkt-Charge-Confirm + Inbox-Sektion + 21d-Expiry), Hattrick/Comeback-Approval bei manueller Evidenz, getBaseUrl() | ✅ |
| 3 | Saisonstart 26/27: **Saison-Bump-Architektur** (Cron 15.7. bumpt teams.saison in-place), Renewal-Clone-Provenance (clonedFromPledgeId + Unique-Index), seasons-Seed-Migration (2526/2627/2728), computeTrialEndsAt (Trial = max(now+30d, Saisonstart+30d), 70d-Horizont), Crawling trotz Trial-Ende, Renewal-Mails konsolidiert (Stages 30/14/3, 1-Click-HMAC), **Vorsaison-Backfill via ajax.team.matchplan** (ganze Saison in 1 Request, score-font-dekodiert) + backfill-team-history + Onboarding-Hook (<3 gespielte), „Letzte Saison"-Block (Team-Dashboard + /m/), Saison-Ergebnis-Resolver (Vorsaison bis 1.10.), Recap verlinkt | ✅ |
| 4 | Journey/UX: Push-Deeplink Sponsoren→/m/, Wizard-onInvalid, Sommerpause-Badge, Coverage-Kommunikation (none-Teams onboardbar, alles manuell + Sponsor-Approval erzwungen), Check A verdrahtet, Spezialtor-Mirror + Server-Validierung (auch Edit), Mitglieder-Invite-Mail, Team/Verein verlassen, Terminologie-Sweep (Wette/Charge/Pledge raus), Empty-State-Offensive (Verein-„Nächste Schritte"), Kontrast /40→/60 + Pill-Sweep, eur()-Helper, Sitemap+Title+og, /status token-gegated | ✅ |
| 5 | V1-Features: **Sponsor-Billing-Cycle** (monthly/season_end, History+Snapshot, Saisonende-Rechnungslauf 1.7., Wechsel-Regeln inkl. K1-Fix), **Lizenz-Transfer** (Spec §1.5: Anfrage→T entscheidet, Branding sofort via licensedUnderClubId, Stripe cancel_at_period_end, Flip-Cron; Rechnung gehört dem Billing-Club), **Pay-Links** (PayPal.Me+Stripe-Link auf PDF/Mail, injection-sicher), **Vereins-Public-Profil /v/[slug]** (verifiedAt-Gate, Pflege-UI, Sitemap), **Zahlungserinnerungs-Vorlage** (Copy/mailto, KEIN Auto-Versand — User-Entscheid statt Spec-§1.11-Mahncron) | ✅ |
| 6 | Reviews: jede Phase adversarial reviewed (Befunde K1–K3/M1–M7 etc. gefixt) | ✅ |

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

## Tests

`npm test`: 1338 passed / 40 skipped (163 Files) · `tsc --noEmit` clean · Stand 2026-06-12.
Test-Infra: Vitest-Modul-Isolation erzeugt einen DB-Pool pro Datei → lib/db/client.ts begrenzt im Test (max=2, idle_timeout=5s); docker-compose.test.yml empfiehlt max_connections=400.

## Spec-Referenzen

- **Primary:** docs/superpowers/specs/2026-05-26-v1-final-scope-consolidation.md
- **Audit-Pläne:** docs/superpowers/plans/2026-06-11-audit-umsetzung-master.md (+ Phase 1–5 Pläne)
- **Offene Spec-Gaps (bewusst Backlog):** Referral-Attribution (F2), Verein-wirbt-Verein, Soft-Delete clubs/teams, Notification-Mail-Präferenzen (Digest), strukturierte Saisonziele mit Auto-Check, Graceful-Downgrade-Pause (F4).
