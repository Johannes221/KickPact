# KickPact Autopilot State

> **Live tracking file für die autonome Plan-Implementation.**

## Aktueller Stand

- **Branch:** `phase-d-invoicing`
- **Aktiver Plan:** Plan 4 (Invoicing + PDF + Mail + Saison-Ende)
- **Plan-Datei:** [docs/superpowers/plans/2026-05-20-kickpact-plan-4-invoicing.md](docs/superpowers/plans/2026-05-20-kickpact-plan-4-invoicing.md)
- **Phase:** A+B done (4/12) — **C startet** (Generate-Invoices Inngest-Job)
- **Nächster Task:** Task 6 (Query-Helpers für Billing) + Task 7 (Inngest generate-invoices Function)
- **Status:** `ready`
- **Letzter Lauf:** 2026-05-20 — Plans 1+2+3 merged in main, Plan 4 Phase A+B done. Bugfix Better-Auth-Schema mit updatedAt-Spalten.
- **Blocker:** keine

## Plan-Übersicht & Fortschritt

| Plan | Phasen | Tasks done | Status |
|---|---|---|---|
| 1 — Foundation | A–F | 29/29 ✅ | merged into main |
| 2 — Auth + Onboarding | A–G | 21/21 ✅ | merged into main (PR #1) |
| 3 — Match-UI + Approvals | A–E | 14/14 ✅ | merged into main (PR #3) |
| 4 — Invoicing + PDF + Mail | A–E (12 tasks) | 4/12 | **active** |
| 5 — Stripe-Abo | TBD | 0/? | **needs Stripe-Keys** |
| 6 — Brand + Deploy | TBD | 0/? | **needs Johannes-Review** |

## Hotfixes seit Plan 3 Merge

- `675d126` — fix(auth): added `updatedAt` to sessions/accounts/verifications + `idToken` to accounts. Better Auth complained and Magic Link returned 500. **Fixed + DB-migrated.** Magic Link works.

## Verfügbare Secrets (in .env.local, gitignored)

- ✅ DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL · RESEND_API_KEY · MAIL_FROM
- ❌ R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET (Plan 4 — Storage fällt auf `/tmp/kickpact-pdfs/` zurück bis R2 set)
- ❌ STRIPE_* (Plan 5 blockiert)
- ❌ GOOGLE_CLIENT_ID / SECRET (optional)

## Bekannte Limitierungen

- **Resend-Domain** noch nicht verifiziert — Magic-Link + Reminder + Invoice-Mails nur an `dattonius99@gmail.com`. Plan-6-Punkt.
- **R2-Storage** nicht konfiguriert — PDFs landen lokal in `/tmp/kickpact-pdfs/`. Funktioniert für Tests, aber für Production R2-Keys nötig.

## Auto-Pause-Punkte

- **Vor Plan 5 (Stripe):** Stripe-Keys nötig
- **Vor Plan 6 (Brand):** Brand-Entscheidungen + ui-ux-pro-max
- **Bei Blockern:** Test-Failures > 2 retries, fehlende Secrets, Migration-Fail

## Log

| Datum | Plan | Phase | Task | Status |
|---|---|---|---|---|
| 2026-05-19 | 1 | A–F | 29 | ✅ done |
| 2026-05-19 | 2 | A–G | 21 | ✅ done, merged in main (PR #1) |
| 2026-05-20 | 3 | A–E | 14 | ✅ done, merged in main (PR #3) |
| 2026-05-20 | — | hotfix | — | `675d126` Better Auth schema (updatedAt + idToken) |
| 2026-05-20 | 4 | — | — | Plan 4 written (`c72b6a2`) |
| 2026-05-20 | 4 | A+B | 1+4+5 | ✅ DONE (`4fe2ac0` install + period + numbering + storage) |
| 2026-05-20 | 4 | A | 2 | ✅ DONE (`f7654cb` PDF invoice builder with brand) |
