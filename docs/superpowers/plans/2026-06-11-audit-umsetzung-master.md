# Audit-Umsetzung 2026-06-11 — Masterplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Findings des 7-Agenten-Audits vom 2026-06-11 fixen + Saisonstart-Paket 2026/27 + die 4 offenen V1-Spec-Features bauen.

**Architecture:** 6 sequenzielle Phasen, jede für sich lauffähig, getestet und nach Review auf `main` gemerged (Coolify-Staging-Deploy). Detail-Pläne pro Phase entstehen unmittelbar vor der Phase (Code im Plan basiert auf frisch gelesenen Dateien). Phase 1 läuft inline (kritischster Live-Fix), Phasen 2–5 via subagent-driven-development mit Review pro Task.

**Tech Stack:** Next.js 15 App Router · Drizzle/Postgres (Neon) · Inngest · Stripe Subscriptions · Vitest (Test-DB) · @react-pdf/renderer

---

## Entscheidungen des Users (2026-06-11)

1. **Saison-Rollover:** Rollover-Job mit neuen Saison-Team-Rows (Default-Empfehlung; Q1-Antwort war uneindeutig „siehe Nachricht unten" — Annahme dokumentiert, früh korrigierbar).
2. **Trial:** Trial läuft bis in die Saison hinein — **30 Tage IN der Saison kostenlos** (Trial-Ende = max(Signup+30d, Saisonstart+30d)).
3. **Scope:** Alle 4 V1-Features bauen (Season-End-Sponsor-Abrechnung, Lizenz-Transfer, Pay-Links, Vereins-Public-Profil). **KEINE automatischen Mahnungen** — stattdessen kann der Verein sich eine Zahlungserinnerungs-Vorlage erzeugen (Copy/Mailto). Season-End = Rechnung geht an Sponsoren.
4. **DNS kickpact.com:** bleibt offline bis alles läuft. Code-seitige Domain-Fallbacks werden trotzdem gefixt.

## Watch-Points (bewusste Trade-offs)

- **Sommerpause-Fix (Phase 1):** `matches` hat kein Wettbewerbs-Feld → Freundschaftsspiele 1.–15.6. innerhalb des Pledge-Fensters würden nach dem Fix charten. Akzeptiert: Crawler pausiert ab 16.6., Pledge-Fenster enden i.d.R. 30.6., Sponsor-Approval + Storno existieren als Netz.
- **Sub-Sponsoren-Copy im Sponsor-Onboarding:** Feature existiert nicht und ist lt. Spec 1.1 bewusst raus (Account-Sharing) → Copy wird ENTFERNT, nicht das Feature gebaut.
- **Spec 1.8 URL-Schema `/{verein-slug}`:** überholt durch Identity-Refactor-Entscheid „URL bleibt" (`/m/[slug]` für Teams). Vereins-Public-Profil kommt analog unter `/v/[slug]`.

---

## Phasen

### Phase 1 — Sommerpause-Charge-Lücke (LIVE-SCHADEN, inline)
Plan: `2026-06-11-phase1-sommerpause-charge-luecke.md`
- [x] Geplant
- [ ] Umgesetzt + getestet
- [ ] Auf main gemerged + Staging verifiziert
- [ ] Juni-Reparatur (Re-Evaluation) gelaufen

Findings: Sommerpause-Cron vernichtet Charges 1.–15.6. (evaluation.ts:43) · sommerpausePaused-Flag nie zurückgesetzt (pledges.ts:106) · manuelle Pause unterdrückt gespielte Spiele für immer (pausedAt fehlt) · endPledges beendet nur active (lifecycle-cleanup.ts:94).

### Phase 2 — Geld-Integrität (Stripe + Charge-Lifecycle)
Plan: `2026-06-11-phase2-geld-integritaet.md`
- [ ] Geplant / Umgesetzt / Gemerged

Findings: Plan-Wechsel erzeugt zweites Stripe-Abo (subscriptions.ts:108) · payment_method_types hart kodiert (subscriptions.ts:116) · Webhook-Event bei Handler-Fehler verloren + Out-of-Order + invoice.paid-Race (webhook/route.ts) · Read-Only-Gate verwirft Charges endgültig (evaluate-match.ts:38) · Rechnungsversand-Fehler verschluckt (generate-invoices.ts:283) · results_only-Doppel-Charge (match-events.ts:88) · Monats-Cap-Monatswechsel-Mismatch (evaluate-match.ts:132) · Re-Scrape-Charges ohne Approval-Row (evaluate-match.ts:170) · Builder-Param-Validierung (goals_scored_min/goal_diff_min/player_name; validations/pledge.ts:78) · season_custom Auto-Confirm → Sponsor-Approval (evaluate-season.ts:131) · Trial-Reset beim Checkout (subscriptions.ts:104) · Saison-Pass-void im Sommer (season-pass.ts:57) · Basic-Caps nach Downgrade (plan-features.ts:59) · confirmApproval falscher Charge-Row (approvals.ts:29) · charges_unique_season_idx ohne cancelled-Ausschluss (schema/charges.ts:84) · Cap-Check außerhalb tx in addManualEvent (match-events.ts:199) · Rechnungs-Periodenlücke 1s + UTC (invoicing/period.ts:14) · Hattrick/Comeback Auto-Confirm auf Manual-Events (triggers.ts:249) · Phantom-Tore auf scheduled (match-events.ts:79) · tote evaluateSeasonTriggers-Engine entfernen (triggers.ts:406) · past_due-Grace via updatedAt (subscription-status.ts:68) · negativer Monats-Cap (validations/pledge.ts:103) · Domain-Fallbacks vereinheitlichen (subscriptions.ts:18, expire-trials.ts:22, webhook/route.ts:139).

### Phase 3 — Saisonstart-Paket 2026/27
Plan: `2026-06-11-phase3-saisonstart.md`
- [ ] Geplant / Umgesetzt / Gemerged

Inhalt: Saison-Rollover-Job (neue 2627-Team-Rows + Crawl-Routing auf neueste Saison-Row + Doppel-Team-Dedupe, crawler.ts:34/265) · Vorsaison-Backfill via wam_competitions→Staffel→Spieltagsübersicht (fussballde.ts:845-TODO) + Saison-Filter-Fix für historische Anzeige (fussballde.ts:877, matches.ts:55) · seasons-Seed als Migration inkl. 2526-Row · Trial-an-Saisonstart-Koppelung (pricing.ts:241, create-draft-club.ts:147) + Crawl trotz expired Trial (Daten laufen, Schreib-Features gesperrt) · Renewal-Mailstrecken konsolidieren (season-end-reminders → 1-Click-HMAC-Link, renew-Param-Sackgasse weg) · Recap verlinken · setSeasonResult in Sommerpause erlauben (season-results.ts:36).

### Phase 4 — Journey/UX-Fixes
Plan: `2026-06-11-phase4-journey-ux.md`
- [ ] Geplant / Umgesetzt / Gemerged

Inhalt: Terminologie-Sweep (Saison-Wetten ×3, Charges-Nav, Spiel-Detail, Storno-Mail mit triggerLabel(), Season-End-Mail, Datenschutz) · Ergebnis-Push-Deeplink für Sponsoren auf /m/<slug> (notify-match-result.ts:70) · stiller Submit-Fail Step 4 (pledge-builder.tsx:227) · Sommerpause-Kommunikation (Badge „Sommerpause" + Hinweis) · Sub-Sponsoren-Copy raus (sponsor/onboarding/page.tsx:41) · Coverage-Kommunikation (results_only/none in Onboarding + Pacts-Tab + Spiele-Empty-State; search.ts:119) · Onboarding Check A verdrahten (onboarding-collision.ts:34) · Spezialtor-Mirror manual-event-editor ↔ special-goals.ts + Server-Enum-Validierung · Mitglieder-Invite-Mail · „Team verlassen" · toter CTA mannschaften/page.tsx:27 · canMarkPaid nach Rolle (abrechnungen/page.tsx:56) · saisonLabel 2526→25/26 · Sponsor-Inquiry-Actions auf {ok,message} (sponsor-inquiries.ts, approvals.ts) · abgelaufene Einladung → erneut anfragen · approval-row.tsx Subtypen-Labels · Saison-Regel-Window-Hinweis im Builder Step 2 · Empty-State-Offensive (EmptyState-Komponente nutzen: Verein-Dashboard „Nächste Schritte", Spiele-Empty-State mit CTA) · Kontrast-Codemod night-navy/40→/60 (102 Stellen) + 23 Ad-hoc-CTAs auf <Button asChild> · eur()-Helper deduplizieren · /status hinter Gate · Title-Duplikat /m/[slug] · Sitemap + Team-Profile · og:url · Landing-Title mit „KickPact" · sponsor/mannschaften auf Query-Layer · loading.tsx für /konto + /m/[slug] · Galerie-alt-Texte · invite.ts team-scoped Verifikations-Gate (invite.ts:14).

### Phase 5 — V1-Features
Plan: `2026-06-11-phase5-v1-features.md`
- [ ] Geplant / Umgesetzt / Gemerged

Inhalt (Schema-SQL liegt in Spec §3 vor):
1. **Sponsor Billing-Cycle Season-End** (Spec 1.2): sponsors.billingCycle + sponsor_billing_cycle_history + charges.billingCycleSnapshot · Onboarding/Einstellungs-UI · generate-season-end-invoices-Cron (30.06.) · Cycle-Wechsel schneidet sauber.
2. **Lizenz-Transfer** (Spec 1.5): teams.licensedUnderClubId + team_license_transfer_requests · Verein-Onboarding „bestehende Teams claimen" · Inbox/Banner für T · Annehmen/Co-Owned/Ablehnen · Stripe-Timing (T-Sub bis Periodenende, Vereinslizenz ab Folgemonat, Branding sofort) · Mails.
3. **Pay-Links** (Spec 1.9): clubs.paypalHandle + stripePaymentLink · Einstellungs-UI · PDF-Renderer konditional.
4. **Vereins-Public-Profil** unter `/v/[slug]` (analog /m/[slug]): Logo/Hero/Beschreibung + Mannschaftsliste (alle Teams, unabhängig vom Lizenz-Owner) · Sichtbarkeits-Gate via clubs.verifiedAt.
5. **Zahlungserinnerungs-Vorlage** (statt Auto-Mahnung): Button auf Vereins-Rechnungsdetail erzeugt kopierbare Erinnerung (Text + mailto) aus invoice-reminder-Template.

### Phase 6 — Verifikation + Abschluss
- [ ] Voller Test-Lauf (Vitest + tsc) · adversarial-reviewer über Gesamtdiff · qa-tester klickt Staging durch · STATE.md-Rewrite · Memory-Update · Saisonstart-Checkliste finalisiert.

---

## Verifikations-Strategie (jede Phase)

1. TDD: erst fehlschlagender Test, dann Fix. `npm test -- <datei>` vor/nach.
2. Phase-Ende: `npm test` komplett + `npx tsc --noEmit` (Output zeigen).
3. Review (adversarial-reviewer) vor Merge auf main.
4. Nach Push: Staging-Deploy abwarten, betroffene Flows per HTTP/agent-browser verifizieren (kein lokaler Dev-Server — Feedback-Regel).
5. Migrations-Falle beachten: Bump-Fenster-Regel bei Parallel-Branches (Memory reference_migrations_testdb), niemals when-Skip.
