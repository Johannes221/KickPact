# Testing in KickPact

## Test-Ebenen

| Ebene | Verzeichnis | Was wird getestet | Geschwindigkeit |
|---|---|---|---|
| Parser | `tests/scraper/parser/` | DOM → strukturierte Daten | Mittel (Browser) |
| Engine | `tests/scraper/engine/` | Reine Trigger-Funktionen | Schnell |
| Integration | `tests/scraper/integration/` | Inngest-Jobs + DB | Mittel (Postgres) |
| E2E | `tests/e2e/scraper-flow/` | UI-Flows mit Playwright | Langsam |
| Rendering | `tests/rendering/` | PDF + E-Mail Snapshots | Schnell |
| Drift | `tests/scraper/drift/` | Drift-Checker selbst | Schnell |
| Live | `tests/scraper/live-smoke.test.ts` | Echte fussball.de (skipped in CI) | Sehr langsam |

## Ausführung

```bash
npm test                                # Alle (außer Live + E2E)
npm test -- parser                      # Nur Parser-Tests
npm test -- triggers                    # Nur Trigger-Engine
npm run test:e2e                        # Playwright
npm run test:live                       # Live-Smoke gegen echte fussball.de
npm run drift:check                     # Drift-Detection
```

## Vor jedem Commit

```bash
npm test
```

## Wenn fussball.de DOM bricht

1. Drift-Issue wird automatisch erstellt (GitHub Action, täglich 04:00).
2. Issue lesen — welche Felder/Selektoren sind betroffen?
3. `lib/crawler/fussballde.ts` anpassen.
4. `npm run fixtures:refresh` lokal laufen lassen.
5. Tests grün? → commit + push.

## Test-DB lokal

```bash
docker compose -f docker-compose.test.yml up -d
# Erstes Mal: Migrations laufen automatisch beim ersten Test-Run
```

## Lokale Test-DB einrichten (Schritt für Schritt)

DB-/Integration-Tests laufen am robustesten gegen eine isolierte Postgres-
Instanz, **nicht** gegen die geteilte Neon-DEV. So vermeidest du Race-
Conditions wenn mehrere Worktrees oder Test-Läufe parallel arbeiten.

### 1) Docker Desktop starten

Stell sicher, dass Docker Desktop läuft (Mac/Win) bzw. der Docker-Daemon
aktiv ist (Linux). Quick-Check:

```bash
docker info >/dev/null && echo "docker ok" || echo "docker NICHT erreichbar"
```

### 2) Test-Postgres hochziehen

```bash
docker compose -f docker-compose.test.yml up -d
```

Das spinnt einen `postgres:16-alpine` Container auf Port **54329** hoch
(User/Pass `test`/`test`, DB `kickpact_test`). Daten liegen in `tmpfs` —
jeder Container-Neustart ist eine frische DB.

### 3) `.env.local` ergänzen

```bash
# Test-DB-URL (nur Test-Pfade nutzen sie; Runtime nutzt weiterhin DATABASE_URL)
DATABASE_URL_TEST="postgres://test:test@localhost:54329/kickpact_test"
```

`lib/db/client.ts` erkennt automatisch, ob es im Test-Kontext läuft
(`NODE_ENV=test` oder `VITEST=true`), und routet dann auf `DATABASE_URL_TEST`.
Außerhalb von Tests bleibt `DATABASE_URL` (Neon/Prod) unverändert.

### 4) Migrations gegen die Test-DB anwenden

```bash
DATABASE_URL="$DATABASE_URL_TEST" npm run db:migrate
```

(Das `db:migrate`-Script nutzt `dotenv -e .env.local`, übersteuert wird die
URL hier via Shell-Env. Alternativ ein separates `.env.test` mit
`DATABASE_URL=<test-url>` anlegen und dotenv-Flag tauschen.)

Integration-Tests rufen die Migration zusätzlich on-demand auf
(`tests/setup/integration-db.ts > getTestDb()`), daher ist Schritt 4
optional für reine Integration-Suiten — aber für die `tests/lib/*`-Tests
(die direkt `lib/db/client.ts` nutzen) muss das Schema einmal angelegt sein.

### 5) Tests laufen lassen

```bash
npm test
```

Erwartet: alle Tests grün, ohne Race-Conditions auf shared Neon-Tabellen.

### Troubleshooting

**Port 54329 belegt** (z. B. weil eine alte Container-Instanz noch läuft):

```bash
docker ps --filter "publish=54329"
docker compose -f docker-compose.test.yml down
docker compose -f docker-compose.test.yml up -d
```

Falls ein *anderer* Prozess auf 54329 hängt, in `docker-compose.test.yml`
das Port-Mapping ändern (z. B. `54330:5432`) und `DATABASE_URL_TEST` in
`.env.local` entsprechend anpassen.

**Postgres-Image-Pull hängt** (langsam/firmen-Proxy):

```bash
docker pull postgres:16-alpine        # manuell vorladen
```

Alternativ ein bereits gepulltes Image-Tag in `docker-compose.test.yml`
nutzen (`docker images postgres` zeigt vorhandene).

**`connection refused` direkt nach `up -d`**:
Healthcheck braucht 1-3 Sekunden. Falls Tests sofort starten, kurz warten:

```bash
until docker compose -f docker-compose.test.yml exec postgres-test \
  pg_isready -U test -d kickpact_test; do sleep 1; done
```

**Tests laufen weiter gegen Neon obwohl `DATABASE_URL_TEST` gesetzt ist**:
`process.env.NODE_ENV` muss `"test"` sein (Vitest setzt das + `VITEST=true`
automatisch). Falls du Tests aus einem anderen Runner startest, manuell
exporten: `NODE_ENV=test npm test`.

## Neue Trigger-Typen testen

1. Fixture für ein passendes Match wählen.
2. Test in `tests/scraper/engine/triggers-*.test.ts` ergänzen.
3. Integration-Test in `tests/scraper/integration/evaluate-match.test.ts` ergänzen.
4. Falls UI betroffen: E2E in `tests/e2e/scraper-flow/sponsor-pledge-wizard.spec.ts`.

## Layer-Übersicht (was wann nutzen)

- **Parser-Tests** — Wenn du den HTML-Parser änderst oder neue Felder rausziehst.
  Nutzen `tests/setup/playwright-mocks.ts` um lokale HTML-Fixtures statt
  fussball.de zu servieren.
- **Engine-Tests** — Wenn du Trigger-Logik (Tor-Cap, Hattrick, Saison-Sieg)
  baust. Reine Funktionen über Fixture-JSON, keine DB, keine Browser-Cost.
- **Integration-Tests** — Wenn du Inngest-Functions änderst (crawl-matches,
  evaluate-match, evaluate-season, approval-lifecycle). Echte Postgres-Test-DB
  via `tests/setup/integration-db.ts`.
- **E2E-Tests** — Wenn du UI-Flows änderst (Sponsor-Wizard, Approval-Inbox,
  Invoice-Download) oder Multi-Tenant-Isolation absichern willst.
- **Rendering-Tests** — Snapshot der PDF-Rechnung + E-Mail-Templates.
  Schlägt fehl, wenn sich rendered output ändert.
- **Drift-Tests** — Tests für den Drift-Checker selbst (`diffArray`,
  `renderMarkdown`), nicht für fussball.de.
- **Live-Smoke** — Nur manuell oder bei Verdacht auf fussball.de-Änderungen:
  `npm run test:live`. Nicht in CI.
