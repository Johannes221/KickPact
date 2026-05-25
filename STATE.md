# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.

## Stand

- **Branch:** `main`
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push)
- **Letzter Commit:** `ecb7f53` — fix(onboarding): role-aware plan filter (mannschaft → basic/pro, verein → verein)
- **Aktive Initiative:** **Onboarding-Rebuild** (Draft-Plan: [docs/superpowers/plans/2026-05-25-onboarding-rebuild.md](docs/superpowers/plans/2026-05-25-onboarding-rebuild.md)) + **Phase E3 in flight** (Girocode-QR + Sponsor-Pay-Toggle) + **Plan 6 Production-Deploy in Vorbereitung**
- **Phase E1 + E2 + Help-Center sind komplett live** — Verifications-Workflow von Upload bis Admin-Approval + 27 Hilfe-Artikel + Conflict-Claim-Flow

## Plan-Status

| Plan / Spec | Status | Notiz |
|---|---|---|
| **Foundation v1** (`2026-05-19-kickpact-v1-design.md`) | ✅ ~95% live | Stripe-Connect-Sektion durch Trust-Spec ersetzt |
| **Auth + Onboarding** | ✅ live | Magic-Link + Google + Apple, E2E-Bypass-Stub für Tests (`9d4b785`) |
| **Match-UI + Approvals** | ✅ live | Approval-Inbox, Manual-Events, Saison-Wetten |
| **Invoicing + PDF + R2** | ✅ live | PDF-Builder, IBAN+Disclaimer, R2-Storage |
| **Stripe-Abo (Pricing v2)** | ✅ live | 3 Tiers × 3 Cycles (9 SKUs), Saison-Pass-Pause, Vereinslizenz-Bündelung |
| **Identity Phase A+B** | ✅ live | `pickDashboardDestination`, Role-Switcher, Multi-Identity-Header |
| **Identity Phase C** | ✅ live (über Conflict-Claim) | `zugriff-anfragen` mit Doc-Upload + Admin-Conflicts-Page (`2a5070a` + `c9f2188`) |
| **Identity Phase D** (Mobile-IA-Tiles) | ⚠️ teilweise | Team-centric Dashboard deckt vieles ab |
| **Team-Member-Invitations** | ✅ live | Migration 0018, Mitglieder-Admin + `/team-einladung` Route |
| **Audit-Fix Phase 1** (Show-Stopper) | ✅ live | Stripe-Placeholder, /api/squad, Impressum, DSGVO-Spielerblock |
| **Audit-Fix Phase 2** (Geld-Risiken) | ✅ live | Alle 8 Bugs gefixt inkl. B-1 Monthly-Cap-Race (`9cc1e2a` + evaluate-match in `9c613f9`) |
| **Audit-Fix Phase 3** (Subscription-Lifecycle) | ✅ live | Webhook-Idempotenz, expire-trials/approvals, end-pledges, sent_notifications |
| **Audit-Fix Phase 4** (DSGVO) | ✅ live | Magic-Link Rate-Limit, PII-Masking, cleanup-sessions, players.blocked, Account-Export, Account-Deletion + Anonymize-Cron |
| **Audit-Fix Phase 5** (Performance) | ✅ live | 8 Perf-Indexes (Migration 0019), Crawler-Batch, Inngest-Concurrency-Limits |
| **Team-centric Dashboard** | ⚠️ ~80% | 5 Sub-Pages live + hart-redirect basic/pro + Finanzen-Trend-Chart. Abo + Einstellungen Tabs pending (siehe Onboarding-Rebuild Entscheidung) |
| **Trust & Payment Spec (non-custodial)** | ✅ verifiziert | Code war nie custodial — Spec dokumentiert Realität |
| **Phase E1** (Verifications Schema+Upload+Gate) | ✅ live | Schema + Storage + Queries + Wizard Step 4 + Withhold-Gate |
| **Phase E2** (Admin-Tooling + Mails + Banner + Conflict-Claim) | ✅ live | `/admin/verifications` + `/admin/conflicts` + 3 Mail-Templates + `VerificationBanner` auf Verein/Sponsor-Discover |
| **Phase E3** (Girocode QR + Sponsor-Pay-Toggle) | 🚧 in Arbeit | Background-Agent baut gerade |
| **Help-Center** | ✅ live | 27 Markdown-Artikel + `/hilfe`-Routes + Frontmatter-Navigation (`206c640` + `68f11f1`) |
| **Onboarding-Rebuild** | 📝 Draft-Plan | [`onboarding-rebuild.md`](docs/superpowers/plans/2026-05-25-onboarding-rebuild.md) — Mannschaft-first Routing + Draft-Persistence ab Step 1 + Pro-Trial-Default |
| **Plan 6: Production-Domain `kickpact.com`** | 🚧 Plan in Arbeit | Background-Agent schreibt detaillierten Deploy-Plan |

## Audit-Trail

- **2026-05-24:** [docs/audits/2026-05-24-onboarding-audit.md](docs/audits/2026-05-24-onboarding-audit.md) — Onboarding-Tiefenprüfung
- **2026-05-24:** [docs/superpowers/plans/2026-05-24-codebase-audit.md](docs/superpowers/plans/2026-05-24-codebase-audit.md) — Erster Codebase-Audit (30 Findings)
- **2026-05-25:** [docs/audits/2026-05-25-codebase-audit.md](docs/audits/2026-05-25-codebase-audit.md) — Folge-Audit nach Phase 1-3 + non-custodial Pivot
- **2026-05-25:** [docs/audits/2026-05-25-feature-catalog-gap-analysis.md](docs/audits/2026-05-25-feature-catalog-gap-analysis.md) — Vollständiger Feature-Katalog Soll/Ist über alle Rollen

## Verfügbare Secrets (Coolify + .env.local)

- ✅ DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL
- ✅ RESEND_API_KEY · MAIL_FROM
- ✅ GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
- ✅ APPLE_CLIENT_ID + APPLE_CLIENT_SECRET (pre-signiertes JWT, gültig bis 2026-10-17)
- ✅ STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + 9 STRIPE_*_PRICE_ID (Test-Mode)
- ✅ R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET
- ✅ PLAUSIBLE_DOMAIN (15 instrumentierte Events)
- ❌ INNGEST_SIGNING_KEY in Production — Route hat fail-closed-Gate
- ✅ KICKPACT_ADMIN_EMAILS für `/admin/verifications` (Coolify)
- ❌ Stripe-LIVE-Keys, Production-DNS, Resend-Production-Domain — alles Plan-6-Scope

## Was als nächstes ansteht

### Pending Entscheidungen (User)

1. **Onboarding-Rebuild approven oder iterieren** — Draft-Plan empfiehlt Mannschaft-first Routing, Draft-Persistence ab Step 1, Pro-Trial als Default. Bei Approval: Plan ausführen (1-2 Tage).
2. **Team-Tabs Abo/Einstellungen** — gemäß Onboarding-Rebuild-Draft bleiben sie für Mannschaft-Plan (basic/pro) nötig, für Vereins-Plan wegfallend. Erst nach Rebuild-Entscheidung bauen.

### In Flight (parallel)

- **Phase E3** (Background-Agent): Girocode QR-Code im PDF + Sponsor-Pay-Toggle „bezahlt/offen"
- **Plan 6 Production-Deploy** (Background-Agent): Deploy-Plan für kickpact.com

### Cleanup-Sweep (½ Tag, jederzeit)

- `scripts/cleanup-dossenheim3-*` + `seed-dossenheim3-*` löschen
- `npm remove @neondatabase/serverless` (ungenutzt)
- Hinfällige Pläne archivieren (`docs/superpowers/plans/archive/`)
- TriggerType Single-Source: `lib/validations/pledge.ts` Zod-Array aus `lib/triggers/labels.ts` ableiten

## Tests

- **473 passed | 40 skipped** (54 test files, 9 skipped)
- TypeScript strict, Build clean
- E2E: Onboarding-Flows un-skipped, Auth-Redirects abgedeckt

## Bekannte Limitierungen

- Apple-JWT-Rotation manuell alle 5 Monate via `scripts/generate-apple-jwt.mjs`
- Staging + Lokal teilen Neon-DB; sauberer wäre eigener Neon-Branch (Plan-6-Scope)
- Crawler `0 */6 * * *` — Phase-5 reduziert N+1, aber UA-Rotation/Jitter noch offen (low prio bis Skalierung)
- Onboarding-Step-4-PDF-Upload-Fehler killt Wizard-State (Onboarding-Rebuild adressiert das)
