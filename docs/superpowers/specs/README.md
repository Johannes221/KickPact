# Specs

**Aktive Specs in diesem Verzeichnis. Archivierte unter [archive/](archive/).**

## Hierarchie

1. **[2026-05-26-v1-final-scope-consolidation.md](2026-05-26-v1-final-scope-consolidation.md)** — **PRIMARY SOURCE OF TRUTH** für v1. Konsolidiert alle Design-Entscheidungen aus 5 Sparring-Runden mit Johannes. Bei Konflikt mit älteren Specs gilt dieses Dokument.

2. **Detail-Specs** — implementations-nahe Detail-Spezifikationen für die jeweiligen Bereiche. Werden von der Konsolidierung referenziert und bleiben gültig für ihre spezifischen Sektionen:
   - [2026-05-22-identity-roles-mobile-ia-design.md](2026-05-22-identity-roles-mobile-ia-design.md) — Rollen-Modell, Identity-Routing, Mobile-IA
   - [2026-05-22-scraper-realdata-validation-design.md](2026-05-22-scraper-realdata-validation-design.md) — Fußball.de-Crawler-Strategie, Drift-Detection
   - [2026-05-25-trust-and-payment-model-design.md](2026-05-25-trust-and-payment-model-design.md) — Non-Custodial-Modell, Verifikation, Withhold-Gate

## Workflow

- **Neue Specs nur** wenn ein neuer Bereich/Thema aufkommt, der von der Konsolidierung nicht abgedeckt ist.
- **Updates an bestehenden Konzepten** kommen in die Konsolidierungs-Spec als Änderung, nicht als neue Spec.
- **Veraltete Specs** wandern nach [archive/](archive/) — nicht löschen, nicht commenten, sondern moven.
