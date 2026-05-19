# KickPact Autopilot State

> **Live tracking file für die autonome Plan-Implementation.**
> Wird vom Scheduled Task `kickpact-autopilot` bei jeder Iteration aktualisiert.
> Mensch-readable. Bei Blockern hier nachschauen, dann Antwort in GitHub Issue.

## Aktueller Stand

- **Branch:** `phase-b-auth-onboarding`
- **Aktiver Plan:** Plan 2 (Auth + Onboarding)
- **Plan-Datei:** [docs/superpowers/plans/2026-05-19-kickpact-plan-2-auth-onboarding.md](docs/superpowers/plans/2026-05-19-kickpact-plan-2-auth-onboarding.md)
- **Phase:** D (Vereins-Onboarding-Wizard)
- **Nächster Task:** Task 9 (Wizard-Shell + Progress-Component)
- **Status:** ready
- **Letzter Lauf:** 2026-05-19 21:50 (manuell)
- **Blocker:** keine

## Bekannte Limitierungen

- **Resend-Test-Key:** kann aktuell nur an `dattonius99@gmail.com` senden (Smoketest verifiziert). Für echte Sponsor-E-Mails muss eine Domain bei https://resend.com/domains verifiziert werden → MAIL_FROM auf `noreply@<verified-domain>` updaten. Plan-6-Punkt vor Pilot-Launch.

## Plan-Übersicht & Fortschritt

| Plan | Phasen | Tasks done | Status |
|---|---|---|---|
| 1 — Foundation | A–F | 29/29 ✅ | merged into `phase-a-foundation` |
| 2 — Auth + Onboarding | A–G (21 tasks) | 0/21 | **active** |
| 3 — Match-UI + Approvals | TBD | 0/? | pending plan-write |
| 4 — Invoicing + PDF + Mail | TBD | 0/? | pending plan-write |
| 5 — Stripe-Abo | TBD | 0/? | **needs Stripe-Keys** |
| 6 — Brand + Deploy | TBD | 0/? | **needs Johannes-Review** |

## Verfügbare Secrets (in .env.local, gitignored)

- ✅ DATABASE_URL (Neon)
- ✅ BETTER_AUTH_SECRET
- ✅ BETTER_AUTH_URL
- ✅ NEXT_PUBLIC_BASE_URL
- ✅ RESEND_API_KEY
- ✅ MAIL_FROM
- ❌ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (optional — Plan 2 läuft auch ohne)
- ❌ STRIPE_SECRET_KEY (needed for Plan 5)
- ❌ STRIPE_WEBHOOK_SECRET (Plan 5)
- ❌ STRIPE_BASIC_PRICE_ID / STRIPE_PRO_PRICE_ID (Plan 5)

## Auto-Pause-Punkte (Autopilot stoppt + öffnet GitHub Issue)

- **Vor Plan 5 (Stripe):** Johannes muss Test-Keys einsetzen
- **Vor Plan 6 (Brand):** Johannes muss Logo/Palette mit `ui-ux-pro-max` entwickeln
- **Bei Blockern:** Test-Failures > 3 retries, fehlende Secrets, Migration-Fail, etc.

## Log

| Datum | Plan | Phase | Task | Status |
|---|---|---|---|---|
| 2026-05-19 | 1 | A–F | 29 | ✅ done (29 commits) |
| 2026-05-19 | 2 | — | — | autopilot armed |
| 2026-05-19 21:22 | 2 | A | 1 | ✅ DONE (`9b33aa0` better-auth install) |
| 2026-05-19 21:25 | 2 | A | 2 | ✅ DONE_WITH_CONCERNS (`fb1db7b` magic-link via Resend, Domain-Verification später nötig) |
| 2026-05-19 21:32 | 2 | A | 3 | ✅ DONE (`9a996e1` Google OAuth conditional, disabled until keys set) |
| 2026-05-19 21:36 | 2 | A | 4 | ✅ DONE (`a161090` session + scope helpers) |
| 2026-05-19 21:42 | 2 | B | 5 | ✅ DONE (`5126cbe` 11 shadcn components + Toaster) |
| 2026-05-19 21:46 | 2 | B | 6 | ✅ DONE (`789e947` app header with auth-aware menu) |
| 2026-05-19 21:50 | 2 | C | 7 | ✅ DONE (`387cfc7` /login + /signup + /verify pages) |
| 2026-05-19 21:53 | 2 | C | 8 | ✅ DONE (`b01b4b8` marketing landing, status moved to /status) |
