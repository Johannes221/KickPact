# KickPact Scraper + Trigger-Engine Real-Data-Validation — Design-Spec

**Datum:** 2026-05-22
**Autor:** Johannes Schartl (mit Claude Code)
**Status:** Draft → Approval pending
**Bezug:** Ergänzt die [v1-Design-Spec](2026-05-19-kickpact-v1-design.md) — fokussiert ausschließlich auf Qualitätssicherung von Scraper, Trigger-Engine, Job-Chain und Frontend-Flows.

---

## 1. Zweck

Ziel ist eine wiederholbare, deterministische Validierungs-Suite, die belegt, dass der KickPact-Scraper gegen reale Daten von [fussball.de](https://www.fussball.de) korrekt arbeitet und gescrapte Match-Events durch die Trigger-Engine in die richtigen Charges überführt werden — bis hinein in Frontend-Flows (Pledge-Wizard, Approval-Inbox, Invoice-Versand). Außerdem soll die Suite Regressionen früh erkennen, wenn fussball.de seine DOM-Struktur ändert, damit Anpassungen ohne Produktions-Schaden vorgenommen werden können.

**Treiber:**
- Aktuell sind ~15 Unit-Tests für die Trigger-Engine vorhanden, aber Scraper nur gegen Mocks getestet → DOM-Brüche werden erst in Production bemerkt.
- Saison-Trigger, Monthly-Cap-End-to-End, Approval-Lifecycle, PDF/E-Mail-Rendering und Multi-Tenant-Authorization sind komplett ungetestet.
- Reale Vereinsdaten erzeugen Edge-Cases (Namens-Prefixes, fehlende Player-IDs, Sonderzeichen), die synthetische Fixtures übersehen.

## 2. Scope

**In-Scope:**
- Fixture-Capture aus 4 echten Heidelberger Vereinen über mehrere Mannschaften und Altersklassen.
- 4 Test-Ebenen: Parser (HTML→Struct), Trigger-Engine (pure functions), Integration (DB + Inngest-Jobs), Frontend E2E (Playwright).
- Pledge-Szenarien: Auto-Trigger, manuelle Approval-Trigger, Saison-Trigger, Kombi-Szenarien.
- Daily Drift-Detection-Workflow (GitHub Action) mit Field-Level-Diff und automatischem Issue-Opening.
- Erweiterte Coverage: Match-Update-Path, Multi-Tenant-Authorization, Negative DOM-/Network-Cases, PDF + E-Mail Snapshot-Tests, Cross-Saison-Pledges.

**Out-of-Scope:**
- Performance-/Lasttests (eigene Initiative).
- Cross-Browser-Testing (E2E nur Chromium).
- Mobile-UI-Testing (App ist v2-Scope).
- Stripe-Connect-Auto-Charge-Tests (v2).
- Real-Money-Flows (KickPact v1 ist Tracking-only).

## 3. Verein-Set + Mannschafts-Auswahl

Vier Vereine bilden das Fixture-Set. Pro Verein werden zwischen 3 und 6 Mannschaften abgedeckt, um verschiedene Saison-Codes, Slug-Patterns und Spielfrequenzen zu testen.

| Verein | Fußball.de-Slug-Pattern | Mannschafts-Mix | Saisons |
|---|---|---|---|
| FC Sportfreunde 1910 Dossenheim | `fc-sportfreunde-1910-dossenheim` | Herren 1, Herren 2, Herren 3, A-Junioren, C-Junioren, Damen | 2526, 2425 |
| SG Heidelberg-Kirchheim | `sg-heidelberg-kirchheim` | Herren 1, Herren 2, B-Junioren | 2526, 2425 |
| TSV Handschuhsheim | `tsv-handschuhsheim` | Herren 1, A-Junioren, D-Junioren | 2526, 2425 |
| SG Schriesheim | `sg-schriesheim` | Herren 1, Herren 2, A-Junioren | 2526, 2425 |

**Begründung der Auswahl:**
- **Dossenheim** ist bereits in `seed-real-dossenheim.ts` / `scrape-dossenheim3-full.ts` etabliert — wir bauen auf Bestehendem auf.
- **SG-Vereine** (Heidelberg-Kirchheim, Schriesheim) testen den `SG`-Prefix in `detectTeamSide`.
- **Verschiedene Altersklassen** validieren, dass `getKader` mit unterschiedlichen Spieler-Pool-Größen umgeht (Jugend hat oft 8–10 Spieler, Senioren 20+).
- **Zwei Saisons** decken den Saisonwechsel-Edge-Case.

Die konkrete fussball.de-`vereinId` und `teamId` pro Mannschaft werden beim ersten Capture-Run automatisch ermittelt und in `tests/fixtures/scraper/manifest.json` persistiert.

## 4. Architektur

```
┌────────────────────────────────────────────────────────────────────────┐
│  ONE-SHOT CAPTURE     scripts/fixtures/capture-fixtures.ts             │
│  Holt Live von fussball.de für 4 Vereine, schreibt HTML + JSON +       │
│  generiert Manifest mit Schema-Inferenz                                │
└────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────────┐
│  FIXTURE-LAYER                                                          │
│    tests/fixtures/scraper/html/<verein>/<typ>.html      ← Layer-1 HTML │
│    tests/fixtures/scraper/json/<verein>/<typ>.json      ← Layer-2 JSON │
│    tests/fixtures/scraper/manifest.json                 ← Schema-Specs │
└────────────────────────────────────────────────────────────────────────┘
                                  │
       ┌──────────────────────────┼─────────────────────────────┐
       ▼                          ▼                             ▼
┌──────────────┐         ┌────────────────┐          ┌──────────────────┐
│ PARSER-TESTS │         │ ENGINE-TESTS   │          │ INTEGRATION/E2E  │
│ (HTML→Struct)│         │ (Triggers,Caps)│          │ (DB+Inngest+UI)  │
│ Layer-1      │         │ Layer-2 JSON   │          │ Layer-2 + Test-DB│
└──────────────┘         └────────────────┘          └──────────────────┘
                                                              │
                                                              ▼
                                                    ┌──────────────────┐
                                                    │ LIVE-SMOKE       │
                                                    │ npm run test:live│
                                                    │ skipped in CI    │
                                                    └──────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│  DAILY DRIFT-DETECTION   .github/workflows/scraper-drift.yml          │
│  Cron 04:00 UTC → scripts/drift/check-drift.ts                         │
│  Field-Level-Diff gegen Manifest → bei Drift: GitHub Issue + Fail     │
└────────────────────────────────────────────────────────────────────────┘
```

## 5. Komponenten

### 5.1 Fixture-Capture-Pipeline

**Datei:** `scripts/fixtures/capture-fixtures.ts`

**Verantwortung:**
- Iteriert über die Verein-Konfiguration (`tests/fixtures/scraper/config.ts`).
- Für jeden Verein:
  1. `searchVereine(name)` → speichert HTML der Suchergebnis-Seite + JSON des Outputs.
  2. `getMannschaften(vereinId, slug)` → HTML + JSON.
  3. Für jede konfigurierte Mannschaft:
     - `getSpiele(teamId, slug, saison)` → HTML der Spielplan-Seite(n) + JSON.
     - `getKader(teamId, slug, saison)` → HTML + JSON.
     - Für die ersten 5 Spiele: `getSpielDetails(spielId, slug)` → HTML + JSON.
- Generiert daraus das Manifest (Schema-Inferenz, siehe 5.6).
- Idempotent: wenn HTML/JSON existiert und `--force` nicht gesetzt ist, skipped es.

**Rate-Limiting:** 800 ms Pause zwischen Requests, Random-Jitter ±200 ms.

**Output:**
```
tests/fixtures/scraper/
├── html/
│   ├── dossenheim/
│   │   ├── search.html
│   │   ├── mannschaften.html
│   │   ├── herren1-spiele-saison2526.html
│   │   ├── herren1-kader-saison2526.html
│   │   ├── herren1-spiel-MATCH_001.html
│   │   └── ...
│   ├── heidelberg-kirchheim/ ...
│   ├── handschuhsheim/ ...
│   └── schriesheim/ ...
├── json/
│   ├── dossenheim/
│   │   ├── search.json
│   │   ├── mannschaften.json
│   │   ├── herren1-spiele-saison2526.json
│   │   ├── herren1-kader-saison2526.json
│   │   ├── herren1-spiel-MATCH_001.json
│   │   └── ...
│   └── ...
├── manifest.json
└── config.ts
```

### 5.2 Fixture-Konfiguration

**Datei:** `tests/fixtures/scraper/config.ts`

```typescript
export const FIXTURE_CLUBS = [
  {
    key: "dossenheim",
    searchTerm: "FC Sportfreunde 1910 Dossenheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "herren2", searchName: "Herren 2", saisons: ["2526", "2425"] },
      { key: "herren3", searchName: "Herren 3", saisons: ["2526", "2425"] },
      { key: "a-junioren", searchName: "A-Junioren", saisons: ["2526"] },
      { key: "c-junioren", searchName: "C-Junioren", saisons: ["2526"] },
      { key: "damen", searchName: "Damen", saisons: ["2526"] },
    ],
  },
  // ... heidelberg-kirchheim, handschuhsheim, schriesheim
] as const;
```

### 5.3 Test-Ebene 1 — Parser-Tests

**Verzeichnis:** `tests/scraper/parser/`

**Strategie:**
- Tests laden HTML-Snapshot aus `tests/fixtures/scraper/html/`.
- Mocken Playwright via `chromium.launch` mit einer Test-Implementation, die statt fussball.de das gespeicherte HTML aus dem Fixture-Dateisystem serviert (via Playwright `page.route()`).
- Rufen die echten Parser-Funktionen aus `lib/crawler/fussballde.ts` auf.
- Vergleichen Output gegen das gespeicherte JSON (Layer-2).

**Test-Dateien:**
- `search-vereine.test.ts` — Suche pro Verein, prüft `name`, `slug`, `vereinId`, `url`.
- `get-mannschaften.test.ts` — Mannschafts-Liste pro Verein, prüft Saison-Codes, Slug-Patterns.
- `get-spiele.test.ts` — Spielplan pro Mannschaft, prüft Pagination, Deduplizierung, `vergangen`-Filter.
- `get-spiel-details.test.ts` — Spieldetails: Halbzeit, Tore, Auswechslungen, Spieler-Namen-Resolution.
- `get-kader.test.ts` — Kader, prüft Player-ID-Extraktion + Fallback.
- `team-side-detection.test.ts` — `detectTeamSide` gegen alle Team-Namen aus den 4 Vereinen.

**Negative Cases (Layer-1):**
- `negative-empty-search.test.ts` — Suche mit unbekanntem Vereinsnamen.
- `negative-404.test.ts` — fussball.de antwortet 404.
- `negative-captcha.test.ts` — Captcha-Page statt erwartetem Content.
- `negative-malformed-dom.test.ts` — Element fehlt (z.B. kein Halbzeit-Stand).

### 5.4 Test-Ebene 2 — Trigger-Engine-Tests

**Verzeichnis:** `tests/scraper/engine/`

**Strategie:** Lädt Match-JSON aus `tests/fixtures/scraper/json/<verein>/<team>-spiel-*.json`, baut `MatchInput` für `evaluateTriggers`, prüft Charge-Proposals.

**Test-Dateien:**
- `triggers-auto.test.ts` — Erweitert bestehende `triggers.test.ts`:
  - `goal_total` mit per_match_cap (3, 5, 10 Tore)
  - `goal_by_player` per `playerId` und per `playerName` (Fallback)
  - `win`, `loss`, `draw` für alle 4 Vereine
  - `clean_sheet` (Sieg ohne Gegentor)
  - `comeback_win` (Halbzeit-Rückstand, dann Sieg)
  - `hattrick` (3, 4, 5 Tore eines Spielers)
  - `goal_diff_min` mit verschiedenen Schwellen
  - `goals_scored_min` mit verschiedenen Schwellen
- `triggers-manual.test.ts` — Manuelle Approval-Trigger:
  - `special_goal` mit allen Subtypes: kopfball, hackentor, volley, fernschuss, elfmeter, freistoss
  - `yellow_card`, `red_card`
  - `assist`, `man_of_match`, `custom`
  - Prüft `requiresApproval=true` und korrekte Charge-Status (`pending_approval`)
- `triggers-season.test.ts` — Saison-Trigger:
  - `season_promotion`, `season_no_relegation`, `season_table_position`
  - `season_champion`, `season_cup_round`, `season_custom`
  - Synthetische Saison-End-Tabelle (kein Live-Scrape nötig)
- `caps.test.ts` — Cap-Durchsetzung:
  - per_match_cap stoppt Charge-Emission mitten in einem Match
  - Monthly-Cap stoppt über mehrere Matches
  - Edge: Cap = 0, Cap = null (unbegrenzt)
- `combo-scenarios.test.ts` — Kombi:
  - 3 Sponsoren auf demselben Team, verschiedene Triggers, korrekte Charge-Zuordnung
  - Pledge-Pause/Resume mitten in der Saison
  - Pledge mit `startsAt`-Datum (Spiele davor → keine Charges)
  - Pledge mit `endsAt`-Datum (Spiele danach → keine Charges)

### 5.5 Test-Ebene 3 — Integration-Tests (DB + Inngest-Jobs)

**Verzeichnis:** `tests/scraper/integration/`

**Setup:**
- Eigene Test-Postgres-DB (via `DATABASE_URL_TEST` env var, lokal: Docker compose oder Neon-Branch).
- Globaler Setup-Hook (`tests/setup/integration-db.ts`):
  - Migrations laufen vor jedem Test-Run.
  - Zwischen Tests: `TRUNCATE` aller Tabellen.
- Inngest-Funktionen werden direkt importiert und mit Mock-Event-Payload aufgerufen (kein echter Inngest-Server nötig).

**Test-Dateien:**
- `crawl-matches.test.ts` — Full Crawler-Job:
  - Mockt `getSpiele` + `getSpielDetails` mit JSON-Fixtures.
  - Verifiziert: Matches inserted, Events inserted, `match/finished` Event emitted.
  - Idempotenz: zweiter Run inserted keine Duplicates.
  - Read-only Mode: Verein ohne aktive Subscription wird übersprungen.
- `evaluate-match.test.ts` — Erweitert bestehenden Test:
  - Auto-Trigger erzeugen `charges.status='confirmed'`.
  - Manual-Trigger erzeugen `charges.status='pending_approval'` + `eventApprovals.status='pending'`.
  - Monthly-Cap-Enforcement über mehrere Matches eines Monats.
- `evaluate-season.test.ts` — Saison-End-Job:
  - Synthetische Saison-End-Daten.
  - Saison-Trigger erzeugen einmalige Charges pro `(pledgeRuleId, saison)`.
- `approval-lifecycle.test.ts`:
  - `pending` → Reminder nach 7d, 14d, 30d.
  - `pending` → Sponsor bestätigt → `confirmed`, Charge → `confirmed`.
  - `pending` → Sponsor bestreitet → `disputed`, Charge → `cancelled`.
  - `pending` → 30d ohne Antwort → Auto-Expire (Saison-Ende), Charge → `cancelled`.
- `match-update-path.test.ts` (**NEU**):
  - Match mit `ergebnis=2:1` inserted, Charges erzeugt.
  - Re-crawl liefert `ergebnis=3:1` (Schiri-Korrektur).
  - Verifiziert: Match wird aktualisiert, alte Charges werden invalidiert/neu berechnet.
  - **Implementierungs-Notiz:** Aktuell skipped der Crawler bereits importierte Matches. Diese Erweiterung erfordert eine kleine Anpassung in `crawl-matches.ts`: Match-Hash-Vergleich (Ergebnis + Events) → bei Differenz Update + Re-Evaluation triggern.
- `cross-saison-pledges.test.ts` (**NEU**):
  - Pledge erstellt in Saison 2425, Team wechselt auf 2526.
  - Verifiziert: Pledge bleibt mit Team verknüpft, Saison-Trigger werden gegen die korrekte Saison evaluiert.

### 5.6 Test-Ebene 4 — Frontend E2E (Playwright)

**Verzeichnis:** `tests/e2e/scraper-flow/`

**Setup:**
- Erweitert bestehende `tests/e2e/` Struktur.
- Vor jedem Test: Test-DB wird mit Fixture-Daten geseedet (über `tests/fixtures/scraper/seed-from-fixtures.ts`).
- Next.js Dev-Server läuft im Test-Setup (über Playwright-Webserver).

**Test-Dateien:**
- `verein-onboarding.spec.ts`:
  - User registriert sich → Onboarding-Schritt 1 (Vereinssuche): Sucht "Dossenheim" → sieht Treffer aus echten Fixture-Daten.
  - Schritt 2: Wählt Mannschaft "Herren 1" → Plan-Auswahl.
  - Schritt 3: Stammdaten (Adresse, USt-ID, IBAN).
  - Schritt 4: Bekommt Sponsor-Einladungslink.
- `sponsor-pledge-wizard.spec.ts`:
  - Sponsor klickt Einladungslink → Sponsor-Onboarding.
  - Pledge-Wizard: Wählt Mannschaft, wählt Ereignisse (Auto + Manual), wählt Player aus Kader (Player-Picker greift auf echte Spielernamen aus Fixtures zu).
  - Submit → Pledge in DB, sichtbar im Sponsor-Dashboard.
- `approval-inbox.spec.ts`:
  - Verein meldet Manual-Event (Hackentor in Match X).
  - Sponsor sieht Pending-Approval in `/sponsor/inbox`.
  - Klickt "Bestätigen" → Charge wird `confirmed`.
  - Anderer Test: Klickt "Bestreiten" → Reason eingeben → `disputed`.
- `verein-ereignisse-view.spec.ts`:
  - Verein sieht Match-Liste, Events pro Match, kann Manual-Event nachtragen.
- `invoice-flow.spec.ts`:
  - Synthetisches Monatsende: `generate-invoices` Job manuell triggern.
  - Sponsor sieht Invoice in `/sponsor/rechnungen` mit PDF-Download.
  - Verein sieht Invoice in `/verein/[slug]/abrechnungen`, kann "Als bezahlt markieren".
- `multi-tenant-isolation.spec.ts` (**NEU**):
  - User A (Sponsor von Dossenheim) loggt sich ein → sieht KEINE Pledges/Charges von User B (Sponsor von Heidelberg-Kirchheim).
  - User A versucht direkten URL-Zugriff auf `/sponsor/pledge/<id-von-B>` → 403/404.
  - User A versucht API-Call auf `/api/invoices/<id-von-B>` → 403/404.
  - User C (Trainer von Verein X) versucht Stripe-Plan von Verein Y zu ändern → 403.

### 5.7 PDF + E-Mail Snapshot-Tests

**Verzeichnis:** `tests/rendering/`

**Strategie:**
- **PDF:** Invoice-PDF wird via `@react-pdf/renderer` zu Buffer gerendert → Text-Extraction → Snapshot.
- **E-Mail:** HTML-Templates (Magic Link, Approval-Reminder, Invoice-Mail) werden gerendert → HTML-Snapshot.
- Snapshot-Files unter `tests/rendering/__snapshots__/`.
- Bei intendierter UI-Änderung: `npm test -- --update-snapshots`.

**Test-Dateien:**
- `invoice-pdf.test.ts` — Verifiziert PDF-Struktur (Header, Items-Tabelle, Total, USt., IBAN, Footer).
- `email-approval-reminder.test.ts` — Reminder-Mail mit korrekten Event-Details, Approval-Links.
- `email-invoice.test.ts` — Invoice-Mail mit korrektem Betrag, Periode, Anhang-Link.
- `email-magic-link.test.ts` — Magic-Link-Mail.

### 5.8 Drift-Detection (Daily Watchdog)

**GitHub Action:** `.github/workflows/scraper-drift.yml`

```yaml
on:
  schedule:
    - cron: "0 4 * * *"  # täglich 04:00 UTC
  workflow_dispatch:      # manuell triggerbar

jobs:
  check-drift:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup-node + npm ci
      - npx playwright install chromium
      - run: npm run drift:check
        env:
          DRIFT_REPORT_PATH: drift-report.json
      - if: failure()
        uses: peter-evans/create-issue-from-file@v5
        with:
          title: "Scraper Drift Detected — ${{ env.DATE }}"
          content-filepath: drift-report.md
          labels: scraper, drift, automated
```

**Skript:** `scripts/drift/check-drift.ts`

**Ablauf:**
1. Lädt Manifest (`tests/fixtures/scraper/manifest.json`).
2. Für jeden Verein: rotierende Subset-Auswahl (1 Mannschaft + 3 letzte Spiele) — um fussball.de-Last gering zu halten.
3. Live-Scrape gegen fussball.de.
4. **Field-Level-Diff** gegen Manifest-Erwartungen:
   - `expectedFields[field].type` matched aktuellen Wert?
   - `expectedFields[field].pattern` matched?
   - `expectedFields[field].enum` enthält aktuellen Wert?
   - `expectedFields[field].nullable` — wenn null und nicht nullable → Drift.
5. **DOM-Anchor-Check**: Jeder im Manifest gespeicherte `domAnchors[].selector` matched aktuell ≥1 Element?
6. Bei Drift:
   - Generiert `drift-report.json` (strukturiert) + `drift-report.md` (menschenlesbar).
   - Markiert die betroffenen Felder + DOM-Selektoren.
   - Speichert HTML-Snapshot der betroffenen Seite unter `drift-snapshots/<datum>/`.
   - Schlägt Selektor-Kandidaten vor (heuristisch: ähnliche Klassen-Namen, gleiche Element-Position).
   - Workflow-Exit-Code 1.
7. Bei kein Drift: Exit 0, kein Issue.

**Manifest-Schema (auto-generiert beim Capture):**

```json
{
  "version": "1.0",
  "generatedAt": "2026-05-22T10:00:00Z",
  "scraperFunctions": {
    "getSpielDetails": {
      "expectedFields": {
        "matchId": { "type": "string", "pattern": "^[A-Z0-9]+$", "samples": ["02FNQF9KE0000000VS5489B6VTVVAJ1U", "..."] },
        "halbzeit.heim": { "type": "number", "min": 0, "max": 20 },
        "halbzeit.gast": { "type": "number", "min": 0, "max": 20 },
        "events[].type": { "enum": ["tor", "auswechslung"] },
        "events[].minute": { "type": "number", "min": 0, "max": 130 },
        "events[].side": { "enum": ["heim", "gast"] },
        "events[].spielerId": { "type": "string", "nullable": true, "pattern": "^[A-Z0-9]+$" },
        "events[].spielerName": { "type": "string", "minLength": 2 }
      },
      "domAnchors": [
        { "name": "event-tor", "selector": "div[class*='icon-tor']", "expectedCount": "≥1" },
        { "name": "event-substitution", "selector": "div[class*='icon-auswechslung']", "expectedCount": "≥0" },
        { "name": "halftime-row", "selector": ".halbzeit, .match-halftime, [data-halftime]", "expectedCount": "1" }
      ],
      "fixtures": [
        "tests/fixtures/scraper/json/dossenheim/herren1-spiel-MATCH_001.json",
        "..."
      ]
    },
    "getSpiele": { /* ... */ },
    "getKader": { /* ... */ },
    "getMannschaften": { /* ... */ },
    "searchVereine": { /* ... */ }
  }
}
```

## 6. Datenfluss

```
Capture-Time (einmalig + on demand):
  npm run fixtures:capture
    → Live fussball.de → HTML + JSON + Manifest
    → git commit -m "chore(fixtures): refresh scraper fixtures"

Test-Time (in CI bei jedem PR):
  npm test
    → Parser-Tests laden HTML, mocken Browser, parsen → vergleichen gegen JSON
    → Engine-Tests laden JSON, evaluieren Trigger → vergleichen gegen erwartete Charges
    → Integration-Tests seeden Test-DB aus JSON → triggern Inngest-Jobs → prüfen DB-State
    → E2E-Tests starten Next.js + Test-DB → simulieren User-Flows

Daily (GitHub Action):
  npm run drift:check
    → Live fussball.de (Subset) → Field-Level-Diff gegen Manifest
    → bei Drift: Issue + Workflow-Fail
    → bei kein Drift: grün

Local Live-Smoke (Developer on demand):
  npm run test:live
    → Live fussball.de für 1 Verein → echter Scraper-Run → grobe Plausibilitäts-Checks
```

## 7. Error-Handling + Resilience

### 7.1 Scraper-Robustness (Production-Code-Erweiterungen)

Diese Verbesserungen am Production-Code (`lib/crawler/fussballde.ts`) werden im Rahmen dieses Projekts mit erledigt, da die Tests sie verlangen:

- **Retry mit Backoff:** Bei `net::ERR_*` oder HTTP 5xx → 3 Retries, exponential backoff (1s, 3s, 9s).
- **Timeout-Eskalation:** Default 30s Page-Load, bei Timeout 1 Retry mit 60s.
- **Graceful Degradation:** Wenn `getKader` keine Player-IDs findet, fallback auf Namen-only-Extraction (existiert bereits — wird verifiziert + dokumentiert).
- **Captcha-Detection:** Wenn Page enthält `<iframe src*="recaptcha"` oder Title `"Sicherheitsabfrage"` → fail loud mit klarer Error-Message statt leerem Ergebnis.
- **Empty-Result-Handling:** Empty-Mannschafts-Liste / Empty-Spielplan → returns leeres Array, kein Throw. Inngest-Job loggt "no data" und fährt weiter.

### 7.2 Match-Update-Path (Production-Code-Erweiterung)

Aktuell skipped `crawl-matches.ts` bereits importierte Matches via `findMatchByFussballdeId`. Erweiterung:
- Statt skip: Match-Hash berechnen aus (ergebnis, halbzeit, sortierte Event-Liste).
- Wenn DB-Hash ≠ Live-Hash → Match aktualisieren, alle abhängigen Charges invalidieren (status → `cancelled` mit Reason `match_updated`), `match/finished` Event neu emittieren.
- Idempotenz bleibt erhalten (Re-Crawl ohne Änderung = no-op).

### 7.3 Test-Resilience

- Parser-Tests laufen ohne Internet (alle Daten lokal).
- Integration-Tests verwenden isolierte Test-DB (kein State-Leak zwischen Tests).
- E2E-Tests starten Next.js auf zufälligem Port (verhindert Konflikt mit lokalem Dev-Server).
- Drift-Detection: bei Network-Fehler ≠ Drift, sondern Workflow-Skip mit Warning.

## 8. Akzeptanzkriterien

Eine Implementierung gilt als komplett, wenn alle folgenden Punkte erfüllt sind:

1. **Fixtures:** `tests/fixtures/scraper/` enthält HTML + JSON für alle 4 Vereine + alle konfigurierten Mannschaften + die ersten 5 Spiele jeder Mannschaft + alle Kader.
2. **Manifest:** `manifest.json` ist auto-generiert und enthält für jede Scraper-Funktion `expectedFields` + `domAnchors`.
3. **Parser-Tests (Layer 1):** ≥ 30 Tests, alle grün. Inkl. 4 Negativ-Cases.
4. **Engine-Tests (Layer 2):** ≥ 40 Tests, alle grün. Bestehende `triggers.test.ts` ist Teil davon.
5. **Integration-Tests (Layer 3):** ≥ 25 Tests, alle grün. Inkl. Match-Update-Path + Cross-Saison.
6. **E2E-Tests (Layer 4):** ≥ 15 Tests, alle grün in Chromium-Headless. Inkl. Multi-Tenant-Isolation.
7. **Rendering-Tests:** ≥ 8 Snapshot-Tests (PDF + E-Mail), alle grün.
8. **Drift-Detection:**
   - GitHub Action `.github/workflows/scraper-drift.yml` existiert.
   - `scripts/drift/check-drift.ts` läuft lokal über `npm run drift:check` mit Exit-Code 0.
   - Test mit absichtlich kaputtem Manifest → Exit-Code 1 + lesbarer Report.
9. **Production-Code-Erweiterungen:**
   - Retry/Backoff in `lib/crawler/fussballde.ts`.
   - Captcha-Detection in `withPage`.
   - Match-Update-Path in `crawl-matches.ts`.
10. **Dokumentation:**
    - `tests/fixtures/scraper/README.md` erklärt Fixture-Struktur + Refresh-Workflow.
    - `docs/testing.md` erklärt Test-Ebenen, wann was nutzen, wie Fixtures aktualisieren.
11. **NPM-Scripts:**
    - `npm run fixtures:capture` (Capture-Run, idempotent)
    - `npm run fixtures:capture -- --force` (Force-Refresh)
    - `npm run drift:check` (lokal Drift-Detection)
    - `npm run test:live` (Live-Smoke gegen echte fussball.de)
    - `npm run test:e2e` (Playwright E2E)
12. **CI:** Bestehender Test-Workflow lädt alle neuen Tests; alle grün.

## 9. Risiken + Mitigationen

| Risiko | Wahrscheinlichkeit | Impact | Mitigation |
|---|---|---|---|
| fussball.de blockt Capture-Run (Rate-Limit / Captcha) | Mittel | Hoch | Capture mit 800ms+jitter Pause, max 6 Vereine simultan, User-Agent rotation; bei Block: manueller Re-Try mit Pause |
| HTML-Snapshots werden groß (>20 MB) | Hoch | Mittel | nur relevante DOM-Bereiche speichern (`outerHTML` von `.match-detail-container` statt ganzer Page), gzip-komprimieren falls nötig |
| Drift-Detection erzeugt false positives | Mittel | Mittel | Tolerance-Field im Manifest (`tolerantWhitespace: true`, `tolerantCasing: true`); Issue-Body enthält "looks-like-drift-but-might-be-false-positive"-Hinweis |
| Test-DB-Setup ist langsam (Postgres-Boot) | Hoch | Niedrig | Lokal Docker compose mit persistentem Volume; in CI Postgres-Service-Container |
| E2E-Tests sind flakey | Hoch | Mittel | Playwright auto-waiting nutzen, keine `page.waitForTimeout`, retry-Strategie pro Test (max 2 retries in CI) |
| Multi-Tenant-Tests übersehen subtile IDOR-Lücken | Mittel | Hoch | Tests probieren systematisch: direkter URL, API-Call, Mutation; OWASP-IDOR-Checklist als Test-Vorlage |

## 10. Implementation-Reihenfolge (Hint für Plan)

Vorgeschlagene Phasen — Detail kommt im Implementation-Plan:

1. **Phase 1 — Fixture-Foundation:** `config.ts`, `capture-fixtures.ts`, erstes Capture, Manifest-Generierung.
2. **Phase 2 — Parser-Tests (Layer 1):** Aller 5 Parser-Funktionen + Negative Cases.
3. **Phase 3 — Engine-Tests (Layer 2):** Erweiterung der `triggers.test.ts` + Saison + Kombi.
4. **Phase 4 — Production-Code-Erweiterungen:** Retry, Captcha-Detection, Match-Update-Path.
5. **Phase 5 — Integration-Tests (Layer 3):** Inngest-Jobs + Approval-Lifecycle + Multi-Tenant.
6. **Phase 6 — Rendering-Tests:** PDF + E-Mail Snapshots.
7. **Phase 7 — E2E-Tests (Layer 4):** Playwright-Flows.
8. **Phase 8 — Drift-Detection:** Script + GitHub Action.
9. **Phase 9 — Docs + NPM-Scripts + CI-Integration.**

Viele dieser Phasen sind unabhängig und können parallel von mehreren Sub-Agents erledigt werden (siehe Plan).

---

## Anhang A — Verzeichnis-Layout (vollständig)

```
KickPact/
├── .github/workflows/
│   └── scraper-drift.yml                          (neu)
├── docs/
│   └── testing.md                                 (neu)
├── lib/crawler/
│   ├── fussballde.ts                              (erweitert: retry, captcha-detection)
│   └── (sonst unverändert)
├── lib/inngest/functions/
│   └── crawl-matches.ts                           (erweitert: match-update-path)
├── scripts/
│   ├── fixtures/
│   │   └── capture-fixtures.ts                    (neu)
│   └── drift/
│       └── check-drift.ts                         (neu)
├── tests/
│   ├── fixtures/scraper/
│   │   ├── config.ts                              (neu)
│   │   ├── manifest.json                          (auto-generated, committed)
│   │   ├── README.md                              (neu)
│   │   ├── seed-from-fixtures.ts                  (neu — für Integration + E2E)
│   │   ├── html/                                  (neu — committed, ~10-20 MB)
│   │   │   ├── dossenheim/
│   │   │   ├── heidelberg-kirchheim/
│   │   │   ├── handschuhsheim/
│   │   │   └── schriesheim/
│   │   └── json/                                  (neu — committed, ~1 MB)
│   │       └── (gleiche Struktur)
│   ├── scraper/
│   │   ├── parser/                                (neu)
│   │   │   ├── search-vereine.test.ts
│   │   │   ├── get-mannschaften.test.ts
│   │   │   ├── get-spiele.test.ts
│   │   │   ├── get-spiel-details.test.ts
│   │   │   ├── get-kader.test.ts
│   │   │   ├── team-side-detection.test.ts
│   │   │   ├── negative-empty-search.test.ts
│   │   │   ├── negative-404.test.ts
│   │   │   ├── negative-captcha.test.ts
│   │   │   └── negative-malformed-dom.test.ts
│   │   ├── engine/                                (neu)
│   │   │   ├── triggers-auto.test.ts
│   │   │   ├── triggers-manual.test.ts
│   │   │   ├── triggers-season.test.ts
│   │   │   ├── caps.test.ts
│   │   │   └── combo-scenarios.test.ts
│   │   ├── integration/                           (neu)
│   │   │   ├── crawl-matches.test.ts
│   │   │   ├── evaluate-match.test.ts             (existiert, wird erweitert)
│   │   │   ├── evaluate-season.test.ts
│   │   │   ├── approval-lifecycle.test.ts
│   │   │   ├── match-update-path.test.ts
│   │   │   └── cross-saison-pledges.test.ts
│   │   └── live-smoke.test.ts                     (neu, skipped in CI)
│   ├── rendering/                                 (neu)
│   │   ├── invoice-pdf.test.ts
│   │   ├── email-approval-reminder.test.ts
│   │   ├── email-invoice.test.ts
│   │   ├── email-magic-link.test.ts
│   │   └── __snapshots__/
│   ├── e2e/
│   │   ├── (bestehende 01-onboarding, 02-pledge-builder bleiben)
│   │   └── scraper-flow/                          (neu)
│   │       ├── verein-onboarding.spec.ts
│   │       ├── sponsor-pledge-wizard.spec.ts
│   │       ├── approval-inbox.spec.ts
│   │       ├── verein-ereignisse-view.spec.ts
│   │       ├── invoice-flow.spec.ts
│   │       └── multi-tenant-isolation.spec.ts
│   ├── setup/
│   │   ├── global.ts                              (existiert)
│   │   ├── db.ts                                  (existiert)
│   │   ├── integration-db.ts                      (neu)
│   │   └── playwright-mocks.ts                    (neu — HTML-Fixture-Server für Parser-Tests)
│   └── (sonst unverändert)
└── package.json                                   (neue scripts: fixtures:capture, drift:check, test:live)
```

## Anhang B — Open Questions (mit Defaults)

| Frage | Default-Antwort (kann später revidiert werden) |
|---|---|
| Werden HTML-Fixtures ins Git committed? | Ja, committed. Erleichtert CI-Setup, Größe (~10–20 MB) ist vertretbar. Wenn zu groß: Git LFS. |
| Test-DB lokal? | Docker compose mit `postgres:16-alpine`. In CI: GitHub Action `services.postgres`. |
| Drift-Detection-Frequenz? | Täglich 04:00 UTC. Kann später bei zu vielen False-Positives auf wöchentlich reduziert werden. |
| Live-Smoke-Test in CI? | Nein, nur lokal via `npm run test:live`. CI bleibt deterministisch. |
| Welche Drift-Toleranzen? | Whitespace, Casing, Reihenfolge bei Listen (sofern Sortierung nicht semantisch) — alles tolerant per default. |
