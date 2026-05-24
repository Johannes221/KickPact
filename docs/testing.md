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
