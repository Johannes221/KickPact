# Phase 5: V1-Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 4 offenen V1-Spec-Features (Spec 2026-05-26 §1.2/1.5/1.9 + Vereins-Public-Profil) + Zahlungserinnerungs-Vorlage (User-Entscheid statt Auto-Mahnung).

**Architecture:** Schema liegt KOMPLETT in Migration 0058 (bereits gemerged — Agenten erzeugen KEINE Migrationen). 3 parallele Pakete: A (Billing-Cycle), B (Lizenz-Transfer), C (Pay-Links + Erinnerungs-Vorlage + Vereinsprofil). User-Entscheide: KEINE automatischen Mahnungen; Season-End-Rechnung geht an den Sponsor.

**Tech Stack:** Drizzle (neue Tabellen sponsor_billing_cycle_history, team_license_transfer_requests; Spalten sponsors.billingCycle, charges.billingCycleSnapshot, teams.licensedUnderClubId, clubs.paypalHandle/stripePaymentLink/descriptionMd/heroUrl), Inngest, @react-pdf/renderer, Stripe (cancel_at_period_end).

---

## Paket A — Sponsor Billing-Cycle Season-End (Spec §1.2)
1. **Cycle-Resolution:** lib/db/queries/billing-cycle.ts: `resolveCycleAt(sponsorId, date)` = jüngste history-Row mit validFrom<=date, sonst sponsors.billingCycle (keine History = nie gewechselt). `changeBillingCycle(sponsorId, cycle)`-Action (Tenancy!) updated sponsors.billingCycle + appendet History (validFrom=now).
2. **Snapshot beim Charge-Insert:** evaluate-match (tx-Insert), addManualEvent, evaluate-season setzen charges.billingCycleSnapshot via resolveCycleAt(sponsor, SPIELdatum bzw. Saisonende-Datum). Sponsor-Lookup über pledge→sponsorId (Query erweitern, kein N+1: Cycle pro Pledge einmal auflösen).
3. **Monats-Rechnung filtert:** generate-invoices nimmt nur Charges mit snapshot='monthly' ODER (snapshot='season_end' UND aktueller sponsors.billingCycle='monthly') — Spec-Wechsel-Regel „gesammelte Charges auf die erste Monatsrechnung".
4. **Season-End-Cron:** lib/inngest/functions/generate-season-end-invoices.ts — 1.7. 05:00 UTC (+Test-Event): alle confirmed/nicht-invoiced Charges mit snapshot='season_end' (und Sponsor aktuell season_end) der abgelaufenen Saison → EINE Rechnung pro (Sponsor, Club) über die bestehende Invoice-Builder-Infrastruktur (generate-invoices als Pattern: Nummernkreis, Withhold-Gate, PDF, Mail an SPONSOR). Periode = [1.7. Vorjahr, 30.6.].
5. **UI:** Cycle-Wahl im Sponsor-Konto (Einstellungs-Karte „Abrechnung": Monatlich / Saisonende, mit Erklärtext) + Hinweis im Sponsor-Dashboard („Beiträge werden am Saisonende abgerechnet"). Onboarding-Default monthly (kein neuer Step — Wahl nachträglich änderbar).
6. Tests: resolveCycleAt (History-Fälle), Snapshot beim Insert, Monats-Filter, Season-End-Cron-Integration (eine Rechnung, korrekte Periode, Mail).

## Paket B — Lizenz-Transfer (Spec §1.4/1.5)
1. **Queries/Actions:** lib/db/queries/license-transfers.ts + lib/actions/license-transfers.ts: `requestLicenseTransfer(teamId)` (Club-Admin des Ziel-Vereins; Team muss eigene aktive team_license/Sub haben; partieller Unique verhindert Doppel-pending — isUniqueViolation → {ok:false,message}); `respondLicenseTransfer(requestId, decision)` (nur fromUserId): accept_license / accept_co_owned / reject.
2. **accept_license:** (a) Branding SOFORT: teams.licensedUnderClubId = toClubId; (b) effectiveAt = current_period_end von T's Stripe-Sub (über bestehende Stripe-Query-Layer; ohne Stripe-Sub z.B. Trial: effectiveAt=now); (c) T's Sub `cancel_at_period_end=true` via Stripe; (d) Lizenz-Flip zum effectiveAt durch täglichen Cron `apply-license-transfers` (idempotent: accepted-Requests mit effectiveAt<=now → team_licenses.parentClubLicenseId auf die Vereins-Lizenz des toClub setzen bzw. Row anlegen; Request → status bleibt accepted + appliedAt-Konvention über decidedAt? nutze effectiveAt-Vergleich + teams-Zustand für Idempotenz).
3. **accept_co_owned:** requestedByUserId bekommt Trainer-Membership auf dem Team (bestehende team_memberships-Infrastruktur); licensedUnderClubId bleibt NULL.
4. **reject:** Mail an Vorstand.
5. **Branding-Wirkung:** Rechnungs-Erzeugung (generate-invoices) adressiert/brandet über `licensedUnderClubId ?? clubId` (Absender, IBAN, Withhold-Gate-verifiedAt) — minimal-invasiv: Resolver-Helper `billingClubForTeam(teamId)`.
6. **UI:** (a) Verein-Mannschaften-Seite: bereits existierende autarke Teams des Vereins (gleiche fussballdeVereinId, nicht licensedUnder) mit CTA „Unter Vereinslizenz anfragen"; (b) T: Banner auf dem Team-Dashboard + Karte in /konto mit Annehmen (Lizenz) / Co-Owned / Ablehnen + Erklärung des Timings („Dein Abo läuft bis Periodenende, die Vereinslizenz übernimmt ab dann; Rechnungs-Branding wechselt sofort"); (c) Status-Anzeige für den Vorstand (pending/accepted/rejected).
7. **Mails:** Anfrage an T, Entscheidung an Vorstand (bestehende Template-Patterns, deutsch, „Pact"-Terminologie irrelevant hier).
8. Tests: Request-Guards (kein Doppel-pending, fremder Verein), accept_license-Effekte (licensedUnder sofort, Stripe cancel_at_period_end-Call gemockt, Cron-Flip), co_owned-Membership, reject, billingClubForTeam.

## Paket C — Pay-Links + Erinnerungs-Vorlage + Vereins-Public-Profil
1. **Pay-Links (Spec §1.9):** Verein-Einstellungen (wo IBAN gepflegt wird — Stelle suchen) bekommt Felder „PayPal.Me-Name" (normalisieren: nur Handle, https://paypal.me/<handle> bauen; Validierung [a-zA-Z0-9]{1,20}) + „Stripe Payment Link" (URL-Validierung, muss mit https://buy.stripe.com/ beginnen). PDF-Renderer (lib/invoicing/builder.tsx): Zahlwege-Block zeigt konditional PayPal-Link + Stripe-Link zusätzlich zum Girocode (Default). Mail-Body (Rechnungs-Mail) listet die Links ebenfalls.
2. **Zahlungserinnerungs-Vorlage (User-Entscheid, KEINE Auto-Mahnung):** Auf der Vereins-Rechnungsdetail-/Abrechnungs-Seite pro offener Rechnung ein Button „Zahlungserinnerung erstellen" → Dialog mit fertigem Text (aus lib/mail/templates/invoice-reminder.tsx-Inhalt abgeleitet, personalisiert: Sponsor, Betrag, Rechnungsnummer, Zahlwege) + „Text kopieren" + mailto:-Link (an Sponsor-Mail, Subject vorbefüllt). KEIN Versand durch KickPact.
3. **Vereins-Public-Profil /v/[slug]:** Neue öffentliche Route app/v/[slug]/ (Pattern von app/m/[slug]/ übernehmen: Server Component, Metadata OHNE doppelten Brand-Suffix, loading.tsx): Vereins-Logo/Hero/Name/Ort/descriptionMd (Markdown-Subset render — wie rendert /m/ Beschreibungen? Pattern übernehmen, sonst Plaintext mit Absätzen), Mannschaftsliste = ALLE Teams des Clubs (auch autark/licensedUnder — Spec: namentliche Zugehörigkeit) mit Link auf /m/<publicSlug> wo öffentlich, sonst ohne Link. Sichtbarkeits-Gate: clubs.verifiedAt IS NOT NULL, sonst 404. Pflege-UI: Verein-Einstellungen „Öffentliches Profil" (descriptionMd-Textarea, Hero-Upload via bestehendem Upload-Route-Handler-Pattern — NICHT Server-Action, 1MB-Falle!). Sitemap: /v/<slug> für verifizierte Clubs ergänzen (production-gated wie /m/). Discovery-/Profil-Querverlinkung: /m/[slug] verlinkt den Vereinsnamen auf /v/<club-slug> wenn verifiziert.
4. Tests: Pay-Link-Validierung/Normalisierung, PDF-Render-Snapshot mit Links (Pattern tests/rendering/invoice-pdf.test.tsx), Erinnerungs-Text-Generator (reine Funktion), /v/[slug]-Query (Gate + Teamliste).

## Verbindlich
- Terminologie Pact/Beitrag/Regel; „Automatische Spieldaten"; deutsch; DB nur via Query-Layer; Mobile-First; KEINE Migrationen (0058 ist komplett — fehlt etwas, im Report melden statt migrieren).

## Abschluss
- Voller npm test + tsc, adversarial-review, Merge + Push.
