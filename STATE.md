# KickPact Autopilot State

> **Live tracking file für die autonome Plan-Implementation.**
> Wird vom Scheduled Task `kickpact-autopilot` bei jeder Iteration aktualisiert.

## Aktueller Stand

- **Branch:** `phase-c-match-ui`
- **Aktiver Plan:** Plan 3 (Match-UI + Manual Events + Approval-Inbox)
- **Plan-Datei:** [docs/superpowers/plans/2026-05-19-kickpact-plan-3-match-ui.md](docs/superpowers/plans/2026-05-19-kickpact-plan-3-match-ui.md)
- **Phase:** A done (3/3) — **B startet** (Manual Event Editor)
- **Nächster Task:** Task 4 (Server Action `addManualEvent`)
- **Status:** `ready`
- **Letzter Lauf:** 2026-05-20 — Tasks 1+2+3 done (Phase A komplett)
- **Blocker:** keine

## Plan-Übersicht & Fortschritt

| Plan | Phasen | Tasks done | Status |
|---|---|---|---|
| 1 — Foundation | A–F | 29/29 ✅ | merged into main |
| 2 — Auth + Onboarding | A–G | 21/21 ✅ | merged into main (PR #1) |
| 3 — Match-UI + Approvals | A–E (14 tasks) | 3/14 | **active** |
| 4 — Invoicing + PDF + Mail | TBD | 0/? | pending plan-write |
| 5 — Stripe-Abo | TBD | 0/? | **needs Stripe-Keys** |
| 6 — Brand + Deploy | TBD | 0/? | **needs Johannes-Review** |

## Verfügbare Secrets (in .env.local, gitignored)

- ✅ DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL · RESEND_API_KEY · MAIL_FROM
- ❌ GOOGLE_CLIENT_ID / SECRET (optional)
- ❌ STRIPE_* (Plan 5 blockiert)

## Bekannte Limitierungen

- **Resend-Domain** noch nicht verifiziert — Magic Link nur an `dattonius99@gmail.com`. Plan-6-Punkt.

## Auto-Pause-Punkte

- **Vor Plan 5 (Stripe):** Stripe-Keys nötig
- **Vor Plan 6 (Brand):** Brand-Entscheidungen + ui-ux-pro-max
- **Bei Blockern:** Test-Failures > 2 retries, fehlende Secrets, Migration-Fail

## Log

| Datum | Plan | Phase | Task | Status |
|---|---|---|---|---|
| 2026-05-19 | 1 | A–F | 29 | ✅ done |
| 2026-05-19 | 2 | A–G | 21 | ✅ done, gemerged in main |
| 2026-05-20 | 3 | — | — | Plan 3 written (`45d4604`) |
| 2026-05-20 | 3 | A | 1 | ✅ DONE (`a475882` match queries) |
| 2026-05-20 | 3 | A | 2+3 | ✅ DONE (`9307d03` match-detail page + timeline) |
