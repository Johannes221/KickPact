# KickPact — Project Context for Codex

## Was ist das?

KickPact ist eine Plattform für performance-basiertes Sponsoring im Amateurfußball. Sponsoren versprechen Beträge pro Spielereignis (z.B. "5€ pro Tor"), Fußball.de wird gescraped, Manual Events meldet der Verein. Monatsende → PDF-Rechnung.

## Source of Truth

- **Konsolidierte Spec (Primary):** [docs/superpowers/specs/2026-05-26-v1-final-scope-consolidation.md](docs/superpowers/specs/2026-05-26-v1-final-scope-consolidation.md) — bei Konflikt mit älteren Specs gilt dieses Dokument.
- **Detail-Specs:** [docs/superpowers/specs/](docs/superpowers/specs/) — Identity-Roles, Scraper-Validation, Trust-Payment.
- **Aktive Pläne:** [docs/superpowers/plans/](docs/superpowers/plans/) — abgeschlossene unter `plans/archive/`.
- **Tagesaktueller Stand:** [STATE.md](STATE.md).

## Stack-Konventionen

- **Next.js 15 App Router** — Server Components als Default, Client Components mit `"use client"` nur bei Interaktivität.
- **Drizzle ORM** — alle DB-Queries durch `lib/db/queries/<domain>.ts`-Layer, niemals direkt in Route Handlern oder Server Components.
- **TypeScript strict** — keine `any`s, keine `as unknown as Foo`-Casts.
- **Tailwind v3.4 + shadcn/ui** — Komponenten unter `components/ui/`, Domain-Komponenten unter `components/<verein|sponsor|shared>/`.
- **Tests** — Vitest unter `tests/`. Trigger-Engine + DB-Queries MÜSSEN Tests haben. UI-Tests E2E in späteren Plans.
- **Inngest** — alle Async-Jobs als Inngest-Functions, niemals direkt aus Route-Handlern. Cron-Schedules in der Function-Definition.

## Verboten

- Alter Code unter `reference/kickpact-legacy/` ist Referenz, NICHT die aktive Codebase. Niemals von dort importieren.
- Keine direkte MongoDB/Mongoose-Verwendung. Alles geht über Postgres+Drizzle.
- Keine PDFKit-Calls. PDF-Rendering via `@react-pdf/renderer` (kommt in Plan 4).
- Keine EJS-Views. Alle UI ist React/Next.js.

## Brand

- Tonalität: sport-energetisch (Strava/sofascore-Richtung).
- Farben: Orange/Rot/Lime-Akzente auf Neutral. Finale Palette + Logo entstehen mit `ui-ux-pro-max` in späteren Plans.
- Marketing-Hook: "Weniger als 1 € pro Spieler im Monat."

## Commands

| Command | Was |
|---|---|
| `npm run dev` | Next.js Dev-Server |
| `npm run inngest:dev` | Inngest-Dev-Server (parallel zu next dev) |
| `npm test` | Vitest run |
| `npm run db:generate` | Migration aus Schema generieren |
| `npm run db:migrate` | Migration auf DB anwenden |
| `npm run db:studio` | Drizzle Studio |
