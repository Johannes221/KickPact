# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.
> Letztes Konsolidieren: 2026-05-27 — MCP-Bootstrap + Crawler-Fix + Infra.

## Stand

- **Branch:** `main` (synced mit `origin/main`)
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push)
- **Letzter Commit:** `4a75461` — chore(sentry): smoke-test Route entfernt + Deprecation-Warnings bereinigt
- **Working-Tree:** clean · **Stashes:** keine

## Zuletzt gebaut (2026-05-27)

| Commit | Was |
|--------|-----|
| `4a75461` | **Infra** Sentry smoke-test cleanup + Deprecation-Warnings in next.config.ts |
| `9a14735` | **Infra** Temporäre Sentry smoke-test Route (KIC-9, entfernt in 4a75461) |
| `1e13b8c` | **Crawler** getMannschaften fix: ajax.club.matchplan Strategy-A + Saison-Helper |
| `b029a0f` | **Docs** STATE.md — P1 features E3/Pledge-Edit/FAB |
| `e922bbb` | **P1** Mobile FAB auf Vereins-Seiten (Sheet + 3 Aktionen nach Rolle) |
| `fecf6c4` | **P1** Pledge bearbeiten/beenden — Cap-Editor + End-Confirmation-Dialog |

## Feature-Status

| Feature | Status |
|---------|--------|
| Onboarding-Rebuild (3-Step Wizard) | ✅ live |
| Club-Verifikation (E1-E5) | ✅ live |
| Mannschafts-Verifikation (Paket B, B1-B6) | ✅ live + 22 Tests |
| Team-Centric Dashboard | ✅ live |
| Einladungs-Inbox (Pending + Revoke + Refresh) | ✅ live (P1) |
| **Withheld-Release E-Mail (E3)** | ✅ live (P1) |
| **Pledge bearbeiten / beenden** | ✅ live (P1) |
| **Mobile FAB** | ✅ live (P1) |
| Season-Renewal-Cron | ✅ live |
| DSGVO / Konto / Help-Center | ✅ live |
| Admin-Platform-Tooling | ✅ live |
| Reporting + CSV + Filter | ✅ live |
| Mannschafts-Lifecycle | ✅ live |
| Storno / Reklamation | 📝 P1 (offen) |
| SEO Sitemap + OG | 📝 P1 (offen) |
| Production-Domain kickpact.com | 📝 wartet auf GO |

## Tests

639 Tests gesamt, alle grün · 85 skipped · 60 Test-Files

## Infra (Stand 2026-05-27)

| Service | Status |
|---|---|
| Sentry | ✅ DSN + AUTH_TOKEN in Coolify Staging, Pipeline verifiziert |
| R2 | ✅ Bucket `kickpact-prod` (EEUR), Credentials in Coolify + Vaultwarden |
| Linear | ✅ KIC-1–12 alle Done (außer KIC-12 Remotion Backlog) |
| MCPs | ✅ Sentry / Linear / Playwright / Cloudflare / Remotion installiert |

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
