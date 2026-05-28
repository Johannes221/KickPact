# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.
> Letztes Konsolidieren: 2026-05-27 — P1-Abschluss + Sommerpause + Cleanup.

## Stand

- **Branch:** `main` (synced mit `origin/main`)
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push)
- **Letzter Commit:** `74d255d` — fix(crawler): getMannschaften div.club-teams Filter (120→28 Teams)
- **Working-Tree:** clean · **Stashes:** keine
- **Coolify:** post_deployment_command = `npm run db:migrate` (ab sofort automatisch)

## Zuletzt gebaut (2026-05-28)

| Commit | Was |
|--------|-----|
| `74d255d` | **fix(crawler)** getMannschaften: `div.club-teams` statt matchplan → 120+ → 28 Teams |
| `5d70972` | **Usertest-Readiness** Approval ohne Login + Admin-Invoice + Resend + Fixes |
| `e2fa410` | **Trial-to-Paid-Fix** Billing-Toggle + Test-Clock |
| `6489ffa` | **SEO** sitemap + robots + keyword metadata + Schema.org + Deployment Strategy |
| `e93ea73` | **SEO** sitemap.ts + robots.ts + OG-Metadata + E2E-Specs (9 Tests) |

## Feature-Status

| Feature | Status |
|---------|--------|
| Onboarding-Rebuild (3-Step Wizard) | ✅ live |
| Club-Verifikation (E1-E5) | ✅ live |
| Mannschafts-Verifikation (Paket B, B1-B6) | ✅ live + 22 Tests |
| Team-Centric Dashboard | ✅ live |
| Einladungs-Inbox (Pending + Revoke + Refresh) | ✅ live |
| Withheld-Release E-Mail (E3) | ✅ live |
| Pledge bearbeiten / beenden | ✅ live |
| Mobile FAB (Verein) | ✅ live |
| Storno / Charge-Stornierung | ✅ live |
| Sommerpause-Logik (Crawler-Guard + Pledge-Pause/Resume) | ✅ live |
| Season-Renewal-Cron | ✅ live |
| DSGVO / Konto / Help-Center | ✅ live |
| Admin-Platform-Tooling | ✅ live |
| Reporting + CSV + Filter | ✅ live |
| Mannschafts-Lifecycle | ✅ live |
| SEO Sitemap + OG | ✅ live (sitemap.ts + robots.ts + OG-Metadata) |
| E2E-Specs Onboarding | ✅ tests/e2e/onboarding.spec.ts (9 Tests) |
| Production-Domain kickpact.com | 🔧 Coolify FQDN gesetzt — DNS A-Record ausstehend (CF-UI) |

## Tests

Alle grün (exit 0) · letzte Ausführung 2026-05-27

## Infra (Stand 2026-05-27)

| Service | Status |
|---|---|
| Sentry | ✅ DSN + AUTH_TOKEN in Coolify Staging, Pipeline verifiziert |
| R2 | ✅ Bucket `kickpact-prod` (EEUR), Credentials in Coolify + Vaultwarden |
| Linear | ✅ KIC-1–12 alle Done (außer KIC-12 Remotion Backlog) |
| MCPs | ✅ Sentry / Linear / Playwright / Cloudflare / Remotion installiert |
| Coolify post-deploy | ✅ `npm run db:migrate` nach jedem Deploy automatisch |

## Spec-Referenzen

- **Primary:** docs/superpowers/specs/2026-05-26-v1-final-scope-consolidation.md
- **Pläne:** docs/superpowers/plans/ (Archiv unter plans/archive/)
- **Audits:** docs/superpowers/audits/

## Secrets (Coolify Staging — alle gesetzt)

DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL ·
RESEND_API_KEY · MAIL_FROM · STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET ·
CLOUDFLARE_R2_BUCKET · CLOUDFLARE_R2_ACCESS_KEY_ID · CLOUDFLARE_R2_SECRET_ACCESS_KEY · CLOUDFLARE_R2_ENDPOINT · CLOUDFLARE_R2_API_TOKEN ·
SENTRY_DSN · NEXT_PUBLIC_SENTRY_DSN · SENTRY_ORG · SENTRY_PROJECT · SENTRY_ENVIRONMENT · NEXT_PUBLIC_SENTRY_ENVIRONMENT · SENTRY_AUTH_TOKEN ·
INNGEST_SIGNING_KEY · INNGEST_EVENT_KEY
