# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.
> Letztes Konsolidieren: 2026-05-27 — P1: E3 Mail + Pledge-Edit + Mobile FAB.

## Stand

- **Branch:** `main` (synced mit `origin/main`)
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push)
- **Letzter Commit:** `e922bbb` — P1: Mobile FAB on Vereins-pages
- **Working-Tree:** clean · **Stashes:** keine

## Zuletzt gebaut (2026-05-27)

| Commit | Was |
|--------|-----|
| `e922bbb` | **P1** Mobile FAB auf Vereins-Seiten (Sheet + 3 Aktionen nach Rolle) |
| `fecf6c4` | **P1** Pledge bearbeiten/beenden — Cap-Editor + End-Confirmation-Dialog |
| `3e772c4` | **E3** Sponsor-Mail wenn withheld Rechnungen freigegeben werden |
| `db6015a` | **P1** Mitglieder-Einladungen-Inbox: offen anzeigen, kopieren/erneuern/widerrufen |
| `51cad17` | **B6** 9 Tests releaseWithheldInvoicesForTeam / ForClub |
| `a2db83b` | **B5-Fix** releaseWithheldInvoicesForTeam aus Stub → echte Impl |
| `780147f` | **B6** 13 Team-Verification-Lifecycle-Tests |
| `d7f819a` | **B4+B5** Admin-Inbox Team-Verifications + Invoice-Gate |

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

645 Tests gesamt, alle grün (623 Basis + 22 neue aus B-Paket)

## Spec-Referenzen

- **Primary:** docs/superpowers/specs/2026-05-26-v1-final-scope-consolidation.md
- **Pläne:** docs/superpowers/plans/ (Archiv unter plans/archive/)
- **Audits:** docs/superpowers/audits/

## Secrets (Coolify + .env.local)

DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL ·
RESEND_API_KEY · MAIL_FROM · STRIPE_SECRET_KEY · STRIPE_WEBHOOK_SECRET ·
R2_ACCESS_KEY_ID · R2_SECRET_ACCESS_KEY · R2_BUCKET · R2_ENDPOINT ·
INNGEST_SIGNING_KEY · INNGEST_EVENT_KEY
