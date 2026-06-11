# Phase 3: Saisonstart-Paket 2026/27 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App ist zum Saisonstart 2026/27 betriebsbereit und „lebendig": Saison-Übergang läuft automatisch, im Sommer onboardete Teams zeigen sofort ihre Vorsaison-Spiele, der Trial überlebt die Sommerpause (30 Tage IN der Saison gratis), Renewal-Mails führen in einen funktionierenden Flow.

**Architecture:** **Saison-Bump statt Saison-Rows** (REVISION der Masterplan-Annahme!): `teams.saison` wird auf derselben Row hochgezählt (Cron 15.7.). Begründung: Am Team-Row hängen teamLicenses (unique teamId), team_memberships, publicSlug (unique), verifiedAt, team_images, season_results — Row-Klonen müsste all das umziehen; der Bump lässt alles stehen. `findNextSeasonTeam` matcht nach dem Bump dieselbe Row (Query auf clubId+fussballdeTeamId+saison). Historie bleibt auf der Row und wird über Datums-Fenster („Letzte Saison"-Block) angezeigt. Die Doppel-Team-Falle (zwei Rows crawlen dieselbe fussballdeTeamId) entfällt strukturell.

**Tech Stack:** Inngest-Crons, Drizzle, fussball.de-Crawler (undici-fetch, Fixture-Replay-Tests), Stripe trial_end (Phase-2-A3-Basis).

---

## Design-Entscheidungen (verbindlich)

1. **Rollover** = `UPDATE teams SET saison=<next> WHERE isActive AND saison=<prev>` als Inngest-Cron `season-rollover` (15.7., 04:00 UTC, nach Crawler-Resume; + Test-Event). `<next>/<prev>` aus Datum ableiten (Logik analog currentSaisonCode in fussballde.ts — als exportierte, getestete Util nach lib/utils/saison.ts ziehen, fussballde.ts importiert sie).
2. **Renewal-Clone-Fix:** `clonePledgeForNextSeason` zielt auf dieselbe Team-Row, wenn `findNextSeasonTeam` null liefert UND die Original-Row weiterexistiert (Pre-Bump-Klicks im Juni!). Idempotenz-Check repariert: nicht „existiert irgendeine Pledge (sponsor, team)" (findet die ALTE Pledge auf derselben Row!), sondern „existiert eine Pledge (sponsor, team) mit endsAt > original.endsAt".
3. **seasons-Seed als Migration 0055** (journal-when 1782400200000): Werte aus lib/db/seeds/seasons.ts für 2627+2728 ÜBERNEHMEN, zusätzlich eine 2526-Row (startsAt 2025-08-01, endsAt 2026-06-30, matchdayFiveAt ~2025-09-15) — `ON CONFLICT DO NOTHING` über einen stabilen Unique-Key (Schema prüfen).
4. **Trial:** `computeTrialEndsAt(now)` (lib/billing/trial.ts NEU) = `max(now + 30d, seasonStart + 30d)` wobei seasonStart = startsAt der zum Zeitpunkt relevanten Saison (laufende Saison: deren startsAt liegt in der Vergangenheit → now+30d gewinnt automatisch; Sommerpause: nächste Saison aus seasons-Tabelle). seasons-Row fehlt → Fallback now+30d. Verwendung in create-draft-club (subscriptions.trialEndsAt) und überall, wo TRIAL_DAYS den Trial stiftet.
5. **Crawling trotz Trial-Ende:** crawl-matches überspringt NUR noch cancelled-Clubs (Daten fließen weiter — App bleibt lebendig, Conversion bleibt möglich). evaluate-match (Geld) bleibt wie Phase 2: past_due/cancelled skippen; ZUSÄTZLICH prüfen, wie der Gate-Reason für abgelaufene Trials heißt — abgelaufener Trial darf KEINE neuen Charges erzeugen (Verein ist unlizenziert), das muss ein eigener Skip-Reason im evaluate-match-Gate sein, falls nicht schon abgedeckt.
6. **Mailstrecken-Konsolidierung:** `season-end-reminders` (kaputter `?renew=`-CTA, 30/14/3d) wird GELÖSCHT; `season-renewal-prompts` (funktionierender 1-Click-HMAC-Link) übernimmt die Staffelung 30/14/3 Tage vor endsAt (Dedupe via sent_notifications mit Stage im Key: `<pledgeId>:<saison>:<stage>`). Mail-Copy: „Pact verlängern" (Terminologie!).
7. **Vorsaison-Backfill (results-only):** Neuer Crawler-Pfad `getVorsaisonSpiele(teamId, saison)` via Team-Detailseite → `wam_competitions`-JSON → Staffel-ID → Spieltagsübersicht (`/spieltagsuebersicht/…/-/staffel/{staffelId}-G`), Zeilen auf Team-Name gefiltert. Nur Endstände (finished + Scores), KEINE Detail-Scrapes/Torschützen (Kosten/Captcha-Risiko; Charges brauchen historische Spiele nie — Pledge-Fenster-Gate schützt ohnehin). Höflichkeit: ≥800ms Delay, Block-Detection (assertNotCaptcha) respektieren, bei Captcha sauber abbrechen.
8. **Backfill-Trigger:** Inngest-Function `backfill-team-history` (Event `crawler/team.backfill`), gesendet (a) am Ende des Onboarding-Crawls, wenn das Team < 3 gespielte Spiele in seiner aktuellen Saison hat, (b) manuell/Admin. Insert DIREKT in matches (status finished) — KEINE match/finished-Events (keine Charges, keine Pushes). Idempotent via fussballdeSpielId-Unique.
9. **„Letzte Saison"-Anzeige:** Query `listPreviousSeasonMatches(teamId, limit)` = matches der Row mit `datum ∈ [saisonStartDate(prevSaison), saisonStartDate(currentSaison))`. UI: Team-Dashboard (app/(verein)/…/mannschaft/[teamId]) und öffentliches Profil (app/m/[slug]) zeigen eine „Letzte Saison"-Sektion (mit S/U/N-Bilanz), wenn die aktuelle Saison < 3 gespielte Spiele hat. Klar beschriftet („Saison 25/26"), damit es nicht wie aktuelle Spiele aussieht.
10. **setSeasonResult in Sommerpause erlauben:** Saison-Ergebnis-Eintrag (lib/actions/season-results.ts) darf bei Read-Only-Grund „paused" (Saison-Pass-Sommerpause) durch — die Saison endet 30.6., genau dann muss der Verein eintragen.
11. **Recap verlinken:** Team-Dashboard bekommt einen sichtbaren Link/Button zur bestehenden Recap-Seite (app/(verein)/verein/[slug]/mannschaft/[teamId]/recap) — z.B. neben/unter dem Saison-Status-Block. Öffentliches Profil NICHT (Recap ist Vereins-Asset zum Teilen).

## Arbeitspakete

### Paket R — Rollover/Renewal/Trial/Mails (Dateien: lib/utils/saison.ts NEU, lib/inngest/functions/season-rollover.ts NEU, lib/db/queries/season-renewal.ts, lib/inngest/functions/season-renewal-prompts.ts, lib/inngest/functions/season-end-reminders.ts LÖSCHEN, lib/billing/trial.ts NEU, app/(onboarding)/onboarding/_actions/create-draft-club.ts, lib/stripe/pricing.ts, lib/inngest/functions/crawl-matches.ts (nur Skip-Bedingung), lib/inngest/functions/evaluate-match.ts (nur Trial-Gate-Reason), lib/actions/season-results.ts, Migration 0055, Recap-Link im Team-Dashboard)
- [ ] R1: lib/utils/saison.ts (currentSaisonCode/nextSaisonCode/prevSaisonCode/saisonLabel, aus fussballde.ts extrahieren) + Tests.
- [ ] R2: season-rollover-Cron + Tests (bump nur isActive+prevSaison; idempotent; loggt Anzahl).
- [ ] R3: clonePledgeForNextSeason-Fixes (Design 2) + Tests (Pre-Bump-Klick im Juni klont auf dieselbe Row mit korrektem Fenster; Idempotenz findet nicht die Alt-Pledge).
- [ ] R4: Migration 0055 seasons-Seed (Design 3).
- [ ] R5: computeTrialEndsAt + Verdrahtung (Design 4) + Tests (Sommer-Onboarding → Trial endet 30 Tage nach Saisonstart; Mitten-in-Saison → 30 Tage ab jetzt).
- [ ] R6: Crawl-Skip nur cancelled + Trial-Gate in evaluate-match (Design 5) + Tests.
- [ ] R7: Mailstrecken-Konsolidierung (Design 6) + Tests (Stages, Dedupe, Link-Ziel = HMAC-Renewal-Route).
- [ ] R8: setSeasonResult bei paused erlauben (Design 10) + Test.
- [ ] R9: Recap-Link (Design 11).

### Paket S — Vorsaison-Backfill + Letzte-Saison-UI (Dateien: lib/crawler/fussballde.ts (+ neue Hilfsdatei lib/crawler/vorsaison.ts bevorzugt), lib/inngest/functions/backfill-team-history.ts NEU, lib/inngest/functions/crawl-matches.ts (Backfill-Event am Onboarding-Ende), lib/db/queries/matches.ts, app/(verein)/verein/[slug]/mannschaft/[teamId]/page.tsx (Letzte-Saison-Sektion), app/m/[slug]/** (Letzte-Saison-Sektion), tests/fixtures/scraper/** (neue Fixtures))
- [ ] S1: getVorsaisonSpiele (Design 7) — Fixture-Replay-Tests (Fixtures live capturen mit dem bestehenden Capture-Tooling unter tests/fixtures/scraper bzw. scripts/; Memory-Falle: withMockedBrowser ist No-Op für fetch-Crawler → undici mocken wie in tests/scraper/*).
- [ ] S2: backfill-team-history (Design 8) + Integration-Test (Insert idempotent, keine Events emittiert).
- [ ] S3: Onboarding-Hook: Backfill-Event nach Team-Crawl bei <3 gespielten Spielen + Test.
- [ ] S4: listPreviousSeasonMatches + Letzte-Saison-Sektionen (Design 9) — Komponenten-Logik serverseitig, klare Saison-Beschriftung, Bilanz-Zeile.
- [ ] S5: Live-Verifikation gegen 1–2 echte Teams (höflich, einmalig): Dry-Run-Script schreibt NICHTS, zeigt nur gefundene Vorsaison-Spiele-Counts.

## Abschluss
- [ ] Voller `npm test` + `npx tsc --noEmit`, adversarial-review, Push auf main, Staging-Smoke.
