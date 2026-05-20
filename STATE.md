# KickPact Autopilot State

> **Live tracking file für die autonome Plan-Implementation.**

## Aktueller Stand

- **Branch:** `main` (alle Phase-Branches gemerged + aufgeräumt)
- **Aktiver Plan:** Plan 4 (Invoicing + PDF + Mail + Saison-Ende) — fortzusetzen
- **Plan-Datei:** [docs/superpowers/plans/2026-05-20-kickpact-plan-4-invoicing.md](docs/superpowers/plans/2026-05-20-kickpact-plan-4-invoicing.md)
- **Phase:** A+B done (4/12)
- **Nächster Task:** Task 6+7 (Query-Helpers + Inngest generate-invoices)
- **Status:** `merged-to-main` — bereit für neue Feature-Branch + Fortsetzung
- **Letzter Lauf:** 2026-05-20 — alle PRs gemerged, stale Branches gelöscht, main synced
- **Blocker:** keine

## Plan-Übersicht & Fortschritt

| Plan | Tasks done | Status |
|---|---|---|
| 1 — Foundation | 29/29 ✅ | merged in main |
| 2 — Auth + Onboarding | 21/21 ✅ | merged in main (PR #1) |
| 3 — Match-UI + Approvals | 14/14 ✅ | merged in main (PR #3) |
| 4 — Invoicing + PDF + Mail | 4/12 | **partial in main (PR #5)** — Tasks 6+7 als nächstes |
| Landing-Rebrand (extra) | done | merged in main (PR #5) — Hero + Stories + Bilder |
| 5 — Stripe-Abo | 0/? | **needs Stripe-Keys** |
| 6 — Brand + Deploy | 0/? | **needs Johannes-Review** |

## Hotfixes seit Plan 3

- `675d126` — `updatedAt` + `idToken` in Better-Auth-Schema. Magic Link funktioniert wieder.

## Verfügbare Secrets (.env.local, gitignored)

- ✅ DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL · RESEND_API_KEY · MAIL_FROM
- ❌ R2_* (Plan 4 — Storage fällt auf `/tmp/kickpact-pdfs/` zurück)
- ❌ STRIPE_* (Plan 5 blockiert)
- ❌ GOOGLE_CLIENT_* (optional)

## Bekannte Limitierungen

- **Resend-Domain** noch nicht verifiziert — System-Mails nur an `dattonius99@gmail.com`.
- **R2-Storage** nicht konfiguriert — PDFs landen lokal.

## Workflow zum Fortsetzen

```bash
cd ~/kickpact
git checkout main && git pull
git checkout -b phase-d-invoicing-cont
# Plan 4 Task 6+ weiterarbeiten
```

## Log

| Datum | Plan | Phase | Task | Status |
|---|---|---|---|---|
| 2026-05-19 | 1 | A–F | 29 | ✅ merged in main |
| 2026-05-19 | 2 | A–G | 21 | ✅ merged in main (PR #1) |
| 2026-05-20 | 3 | A–E | 14 | ✅ merged in main (PR #3) |
| 2026-05-20 | — | hotfix | — | `675d126` Better-Auth-Schema |
| 2026-05-20 | 4 | — | — | Plan 4 written |
| 2026-05-20 | 4 | A+B | 1+2+4+5 | ✅ done (Foundation + PDF Builder) |
| 2026-05-20 | — | landing | — | Hero + Story-Section + 7 Photos |
| 2026-05-20 | — | merge | — | PR #5 merged · alle stale Branches gelöscht · main synced |
