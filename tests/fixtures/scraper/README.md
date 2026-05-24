# Scraper Fixtures

Reale Daten von [fussball.de](https://www.fussball.de) für 4 Heidelberger Vereine:
- FC Sportfreunde 1910 Dossenheim
- SG Heidelberg-Kirchheim
- TSV Handschuhsheim
- SG Schriesheim

## Struktur

```
tests/fixtures/scraper/
├── config.ts          — Verein- und Team-Konfiguration
├── manifest.json      — Field-Level-Schema für Drift-Detection (auto-generiert)
├── html/              — HTML-Snapshots für Parser-Tests
│   └── <verein>/
│       ├── search.html
│       ├── mannschaften.html
│       ├── <team>-spiele-saison<YYYY>.html
│       ├── <team>-kader-saison<YYYY>.html
│       └── <team>-spiel-<spielId>.html
├── json/              — Geparste JSON-Outputs für Engine-/Integration-/E2E-Tests
│   └── (gleiche Struktur wie html/)
├── negative/          — Negativ-Cases (Captcha, 404, leere Suche)
└── seed-from-fixtures.ts — Lädt Fixture-JSON in die Test-DB (Integration-Tests)
```

## Refresh

```bash
# Voller Refresh aller 4 Vereine (~5–10 Min)
npm run fixtures:refresh

# Nur ein einzelner Verein
npx tsx scripts/fixtures/capture-fixtures.ts --only=dossenheim --force

# Nur Manifest neu bauen (ohne Re-Scrape)
npm run fixtures:manifest
```

## Wann refreshen?

- Bei Drift-Detection-Issue: Manifest stimmt nicht mehr → Refresh.
- Bei jeder größeren Saison-Wende: neue Spiele dazu, alte fallen raus.
- Bei DOM-Änderungen auf fussball.de: Erst Scraper anpassen, dann Refresh.

## Was wird **nicht** refreshed?

- HTML-Negativ-Cases unter `html/negative/` (hand-curated)
- `config.ts` (manuell pflegen)

## Fixture-Schema (JSON)

Die Capture-Skripte schreiben deutsche Keys. Die Engine-Test-Helpers
(`tests/scraper/engine/_helpers.ts`) mappen diese auf den engine-internen
`MatchInput`-Shape:

| JSON-Key (capture) | Engine-Key |
|---|---|
| `heim`, `gast` | `heimName`, `gastName` |
| `ergebnis.heim`, `ergebnis.gast` | `ergebnisHeim`, `ergebnisGast` |
| `events[].typ` (`TOR`, `AUSWECHSLUNG`, ...) | `events[].type` (`tor`, `auswechslung`, ...) |
| `events[].spielerId`, `events[].spielerName` | `events[].playerId`, `events[].playerName` |
