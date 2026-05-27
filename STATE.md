# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.
> Letztes Konsolidieren: 2026-05-27 — Paket B (Mannschafts-Verifikation) + P1-Features.

## Stand

- **Branch:** `main` (synced mit `origin/main`)
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push)
- **Letzter Commit:** `db6015a` — feat(mitglieder): Einladungs-Inbox + Revoke + Refresh
- **Working-Tree:** clean · **Stashes:** keine

## Zuletzt gebaut (2026-05-27)

| Commit | Was |
|--------|-----|
| `db6015a` | **P1** Mitglieder-Einladungen-Inbox: offen anzeigen, kopieren/erneuern/widerrufen |
| `51cad17` | **B6** 9 Tests releaseWithheldInvoicesForTeam / ForClub |
| `a2db83b` | **B5-Fix** releaseWithheldInvoicesForTeam aus Stub → echte Impl |
| `780147f` | **B6** 13 Team-Verification-Lifecycle-Tests |
| `d7f819a` | **B4+B5** Admin-Inbox Team-Verifications + Invoice-Gate |
| `a3fbfbd` | **B3** Verifikations-Seite + Upload-Formular (Mannschaft) |
| `3b80d34` | **B2** Server-Action + Storage-Key + Query-Layer |
| `a8b0e16` | **B1** Schema team_verifications + teams.verified_at |
| `9183fbe` | **Rollen-Fix** Team-Pages assertTeamPageAccess + HIGH-2 |

## Feature-Status

| Feature | Status |
|---------|--------|
| Onboarding-Rebuild (3-Step Wizard) | ✅ live |
| Club-Verifikation (E1-E3) | ✅ live |
| **Mannschafts-Verifikation (Paket B, B1-B6)** | ✅ live + 22 Tests |
| Team-Centric Dashboard | ✅ live |
| **Einladungs-Inbox (Pending + Revoke + Refresh)** | ✅ live (P1) |
| Season-Renewal-Cron | ✅ live |
| DSGVO / Konto / Help-Center | ✅ live |
| Admin-Platform-Tooling | ✅ live |
| Reporting + CSV + Filter | ✅ live |
| Mannschafts-Lifecycle | ✅ live |
| Withheld-Release E-Mail (Team) | ⚠️ offen — Phase E3 |
| Pledge bearbeiten / beenden | 📝 P1 |
| Storno / Reklamation | 📝 P1 |
| Mobile FAB | 📝 P1 |
| SEO Sitemap + OG | 📝 P1 |
| Production-Domain kickpact.com | 📝 wartet auf GO |

## Tests

645 Tests gesamt, alle grün (623 Basis + 22 neue aus dieser Session)

## Spec-Referenzen

- **Primary:** docs/superpowers/specs/2026-05-26-v1-final-scope-consolidation.md
- **Pläne:** docs/superpowers/plans/ (Archiv unter plans/archive/)
- **Audits:** docs/superpowers/audits/

## Secrets (Coolify + .env.local)

DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL ·
RESEND_API_KEY · MAIL_FROM · STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET ·
R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET · R2_ENDPOINT ·
INNGEST_SIGNING_KEY · INNGEST_EVENT_KEY
