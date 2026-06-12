# Saison-Features 26/27 Implementation Plan (Spec + Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die App lebt ab sofort in Saison 26/27 (mit Springen zur Vorsaison), Sponsoren sehen beim Pact-Bauen „das hätte letzte Saison X € gebracht", Teams bekommen eine Hochrechnung + ein durchswipebares Saison-Wrapped, und Heim-/Auswärtssieg sind eigene Regel-Typen.

**User-Entscheidungen (2026-06-12, verbindlich):** Umstellung auf 26/27 SOFORT · Heim-/Auswärtssieg = zwei eigene Regel-Typen (eigene Beträge, Auswärts darf mehr zählen) · Voll-Wrapped mit Slides · Simulation auch im Pact-Builder.

**Architecture:** Baut komplett auf der Audit-Umsetzung auf (Saison-Bump-Architektur, „Letzte Saison"-Queries, Recap-Infra, evaluateTriggers-Engine). Simulation = die ECHTE Trigger-Engine über historische Spiele (kein ML — deterministisch, ehrlich, erklärbar). Wrapped = Client-Story-Komponente über einer Aggregat-Query + Share-Bilder via bestehender recap-image-Route-Mechanik.

**Brand-Ton (Wrapped/Simulation-Copy):** sport-energetisch, Gaudi/Community (Positionierungs-Memory) — „Ihr habt 67 Tore geballert", nie Business-Sprech. Terminologie: Pact/Beitrag/Regel.

---

## W1 — Saison 26/27 überall + Saison-Switcher

1. **Sofort-Rollover (Ops, Hauptagent nach Merge):** `season-rollover` via Test-Event mit nowIso-Override (oder gleichwertiges Script) gegen Staging ausführen → alle aktiven Teams `saison="2627"`. Cron bleibt für künftige Jahre.
2. **Wett-Fenster folgt der TEAM-Saison:** `assertWagerWindowOpen` in create-pledge/addPledgeRule bezieht die Saison aus `getSeasonByCode(team.saison)` (Fallback `getActiveSeason(now)`). Damit sind Saison-Ziele für 26/27 ab SOFORT buchbar (Cutoff matchdayFiveAt 15.09.2026), statt am toten 25/26-Fenster zu hängen. Tests: Team 2627 am 12.06. → offen; Team 2526 → zu.
3. **Season-Switcher:** `listMatchesForTeam(teamId, { saison? })` — Fenster `[saisonStartDate(s), saisonStartDate(next(s)))`; `listAvailableSeasonsForTeam(teamId)` = Saisons mit ≥1 Match (aus Datums-Buckets) ∪ team.saison. UI: Saison-Pills/Dropdown („26/27 · 25/26") auf (a) Team-Dashboard-Spieleliste, (b) /verein/[slug]/mannschaft/[teamId]/spiele (falls eigene Page — grep), (c) öffentliches Profil /m/[slug] (Spiele-Sektion). Default = team.saison; leere neue Saison zeigt EmptyState mit „Saison 25/26 ansehen →"-Sprung. Der „Letzte Saison"-Block (Phase 3 S4) bleibt als Teaser, verlinkt auf den Switcher.
4. **Label-Sweep:** Grep nach hartem „25/26"/„2025/26"/„2526" in UI-Copy (nicht Daten!) — alles muss aus team.saison/saisonLabel kommen.

## W2 — Heim-/Auswärtssieg-Regeln

1. **Enum-Migration 0059:** `trigger_type` + `home_win`, `away_win`. ACHTUNG Memory-Falle: orm-Test-Migrator läuft als EINE Transaktion — `ALTER TYPE … ADD VALUE` ist in PG seit v12 in Tx erlaubt, aber der neue Wert ist erst NACH Commit nutzbar → Migration darf den Wert nicht selbst verwenden (reines ADD VALUE ist safe; nachsehen, wie frühere Trigger-Erweiterungen es gemacht haben). Journal-when > 1782450000000 bumpen (z.B. 1782460000000).
2. **Engine** (lib/crawler/triggers.ts, outcome-Pfad): `home_win` feuert wenn Team gewinnt UND teamSide==="heim"; `away_win` analog gast. requiresApproval wie `win` (auto bei gescrapter Evidenz, Phase-2-C3/K2-Regeln gelten automatisch mit). Tests: 4 Konstellationen × 2 Typen.
3. **Builder/Labels:** TRIGGER_META + triggerLabel: „Pro Heimsieg" / „Pro Auswärtssieg" (Hint: „Auswärtssiege kannst du höher bewerten 💪"); Builder-Step-2-Karten neben „Pro Sieg"; coverage: wie win (results_only ok). invoice-run-core TRIGGER_LABELS ergänzen. manual-event-editor unberührt (Outcome, kein Event).
4. **Wrapped/Simulation zählen Heim-/Auswärtssiege** (W3/W4 nutzen dieselbe Aggregation).

## W3 — Geld-Simulation („hättet ihr X € gehabt" + Hochrechnung)

1. **Kern `lib/simulation/pact-simulation.ts` (pure + DB-Wrapper in lib/db/queries/simulation.ts):**
   - `simulateRulesOverMatches(matches: MatchInput[], rules)` → nutzt `evaluateTriggers` PRO Spiel, summiert Proposals; wendet Caps an (perMatch/monthly per Spielmonat/season) — Cap-Logik als vereinfachte, dokumentierte Nachbildung (keine DB). Ergebnis: `{ totalCents, perRule: [{triggerType, count, cents}], topMoments: […] }`.
   - `simulateForTeamSeason(teamId, saison, rules)` — lädt Matches+Events des Saison-Fensters (finished) und ruft den Kern.
   - Saison-Regeln (season_*) aus der Simulation EXKLUDIEREN außer es liegt ein season_result der Saison vor (dann via isTriggerHit bewerten) — sonst ehrlich „ohne Saison-Ziele".
2. **Builder-Panel (Conversion-Hebel):** Im Pact-Builder (Step 3/4) Karte „💡 Rückblick: Mit diesen Regeln hättest du letzte Saison ca. **X €** beigetragen" + 2–3 Detail-Zeilen („31× Tor → 155 €"). Server Action `simulateDraftRules(teamId, rules)` (Tenancy: Team muss discoverable/Invite-Kontext sein — gleiche Gates wie der Builder selbst), client-seitig debounced bei Regel-Änderung. Coverage-Hinweis bei results_only/none („basiert auf Endständen"). Bei 0 Vorsaison-Spielen: Panel ausblenden.
3. **Team-Dashboard-Hochrechnung:** Karte „Prognose": (a) „Letzte Saison hätten eure aktuellen Pacts X € gebracht" (simulateForTeamSeason(prevSaison, aktive Rules aller aktiven Pledges)); (b) sobald die neue Saison ≥3 gespielte Spiele hat: „Auf diesem Kurs: ~Y € bis Saisonende" (linear: bisherige confirmed-Beiträge / gespielte Spiele × erwartete Spiele, erwartete Spiele = Vorsaison-Spielzahl, Fallback 26). Copy weich, „Prognose, kein Versprechen".
4. Tests: Kern-Simulation deterministisch (Fixture-Matches), Cap-Anwendung, Saison-Regel-Exklusion, Action-Tenancy.

## W4 — Saison-Wrapped (Spotify-Stil)

1. **Stats-Query `lib/db/queries/wrapped.ts`:** `getWrappedStats(teamId, saison)` → ein Objekt: Spiele/S-U-N, Tore geschossen/kassiert, bester Torschütze (nur coverage full; Name+Tore), Zu-Null-Spiele, Comebacks (chronologie-basiert, bestehende Logik wiederverwenden), Heimsiege/Auswärtssiege, höchster Sieg (Spiel+Ergebnis), Pacts-Anzahl + Beiträge-Summe der Saison (confirmed+invoiced+paid), Simulation-Fallback wenn 0 Pacts („mit einem 1-€-pro-Tor-Pact wären das X € gewesen" via W3-Kern).
2. **Route `app/(verein)/verein/[slug]/mannschaft/[teamId]/wrapped/page.tsx`** (+ loading.tsx): lädt Stats der VORSAISON (prevSaisonCode(team.saison)); ohne Daten → freundlicher Empty-Redirect aufs Dashboard.
3. **Story-Player (Client-Komponente):** Vollbild 9:16-orientiert (mobil first, desktop zentrierter Phone-Frame), Slide-Mechanik im Story-Stil: Progress-Bars oben, Tap rechts/links = vor/zurück, Swipe, Auto-Advance ~6s (pausierbar via Press&Hold), CSS-Keyframe-Animationen (Count-Up via requestAnimationFrame, Stagger-Reveals) — KEINE neue Dependency. Slides (nur rendern, wenn Daten da): Intro („Eure Saison 25/26 🧡") → Spiele/Bilanz → Tore (Count-Up) → Bester Torschütze → Zu-Null → Comebacks → Heim/Auswärts → Höchster Sieg → Pacts/Beiträge ODER Simulation-Slide → Outro (CTA „Sponsoren für 26/27 einladen" + Share). Design: Brand-Energie (Orange/Rot/Lime-Verläufe auf Night-Navy, Display-Font groß, pro Slide eigene Akzentfarbe), iOS-Design-System-konform.
4. **Share-Bilder:** pro Slide ein 9:16-PNG via next/og-Route `app/api/teams/[teamId]/wrapped-image/[slide]/route.tsx` (Mechanik 1:1 von der bestehenden recap-image-Route übernehmen, gleiche Gates) — Share/Download-Button auf jedem Slide (navigator.share mit Bild-URL, Fallback Download).
5. **Entry-Points:** Team-Dashboard-Karte „✨ Euer Saison-Rückblick 25/26 ist da" (sichtbar solange neue Saison <5 gespielte Spiele und Vorsaison-Daten existieren), Link auf der Recap-Seite („Zur Story-Version"). Kein Cron/Push in v1.
6. Tests: getWrappedStats (DB-Fixture, alle Aggregat-Felder), og-Route Smoke (200+png), Player nur tsc/Render-sicher.

## Aufteilung / Reihenfolge
- Agent A: W1 (Switcher + Wett-Fenster) — Migrationen: keine.
- Agent B: W2 + W3 (Engine/Builder/Simulation) — Migration 0059 (Enum, when 1782460000000).
- Agent C: W4 (Wrapped) — nutzt W3-Kern NICHT direkt (eigener Simulation-Fallback ruft lib/simulation, das B baut) → C startet mit Stats/Player/Share, der Simulation-Slide wird über ein schmales Interface (`simulateRulesOverMatches`) eingebunden; falls B noch nicht gemerged: Slide hinter `if (typeof simulateRulesOverMatches === "function")`-TODO NICHT — stattdessen: C implementiert den Simulation-Slide GEGEN das im Plan definierte Interface und der Hauptagent merged B vor C.
- Merge-Reihenfolge: B → C → A (A berührt Spiele-Listen, C berührt Team-Dashboard — disjunkt genug).
- Danach: Sofort-Rollover (W1.1) auf Staging ausführen, QA-Smoke Wrapped+Switcher, Push.

## Abschluss
- Voller npm test + tsc, adversarial-review, Staging-Verifikation (Wrapped auf echtem Team mit 25/26-Daten ansehen!), finale Meldung.
