# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.

## Stand

- **Branch:** `main`
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push)
- **Letzter Commit:** `2c47860` — fix(onboarding): race-safe finalizeOnboarding via advisory lock
- **Aktive Initiative:** **Phase E1 Closure** — Admin-Tooling, Mail-Templates, Sponsor-Banner. Plan: [docs/superpowers/plans/2026-05-25-phase-e1-closure.md](docs/superpowers/plans/2026-05-25-phase-e1-closure.md)
- **Withhold-Gate ist live** (Commit `c1ce57c`), Phase 4 DSGVO komplett (Commit `19a8edb`)

## Plan-Status

| Plan / Spec | Status | Notiz |
|---|---|---|
| **Foundation v1** (`2026-05-19-kickpact-v1-design.md`) | ✅ ~90% live | Stripe-Connect-Sektion durch Trust-Spec ersetzt |
| **Auth + Onboarding** | ✅ live | Magic-Link + Google + Apple |
| **Match-UI + Approvals** | ✅ live | Approval-Inbox, Manual-Events, Saison-Wetten |
| **Invoicing + PDF + R2** | ✅ live | PDF-Builder, IBAN+Disclaimer, R2-Storage seit `5c5f151` |
| **Stripe-Abo (Pricing v2)** | ✅ live | 3 Tiers × 3 Cycles (9 SKUs), Saison-Pass-Pause Jun-Jul, Vereinslizenz-Bündelung via `parent_club_license_id` |
| **Identity Phase A+B** (Roles, Smart Routing) | ✅ live | `pickDashboardDestination`, Role-Switcher, Multi-Identity-Header |
| **Identity Phase C** (Access-Requests bei Duplikat-Verein) | ❌ offen | Workaround: bessere Error-Message statt 500 |
| **Identity Phase D** (Mobile-IA-Tiles) | ⚠️ teilweise | Team-centric Dashboard deckt vieles ab |
| **Audit-Fix Phase 1** (Show-Stopper) | ✅ live | Stripe-Placeholder, /api/squad, Impressum, DSGVO-Spielerblock |
| **Audit-Fix Phase 2** (Geld-Risiken) | ⚠️ ~95% | B-2 (Read-Only-Gate via `assertClubWriteAccess`) ✅ schon gefixt; B-3 (Approval-Expiry aus `pledges.endsAt`) ✅ live; offen: B-1 Monthly-Cap-Race |
| **Audit-Fix Phase 3** (Subscription-Lifecycle) | ✅ live | Webhook-Idempotenz, expire-trials/approvals, end-pledges, sent_notifications |
| **Audit-Fix Phase 4** (DSGVO-Vollständigkeit) | ✅ live (Commit `19a8edb`) | Magic-Link Rate-Limit, PII-Masking, `cleanup-sessions`-Cron, `players.blocked` Enforcement, `requestDataExport`, `requestAccountDeletion` + `anonymize-accounts`-Cron |
| **Audit-Fix Phase 5** (Performance) | ⚠️ teils | `approval-reminders` Concurrency-Limit ✅ live; offen: Indexes, Crawler-Batch, weitere Mail-Functions Concurrency |
| **Team-centric Dashboard** | ⚠️ ~80% | Routing + 5 Sub-Pages live (Übersicht, Pacts, Spiele, Finanzen, hart-redirect basic/pro) + Finanzen-Trend-Chart. Offen: Abo + Einstellungen Tabs |
| **Trust & Payment Spec (non-custodial)** | ✅ als Architektur-Realität verifiziert | Code war nie custodial — Spec dokumentiert, was schon Realität war |
| **Phase E1** (Verifications) | ⚠️ ~80% live | Schema + Storage + Queries + Wizard + Upload-UI + Withhold-Gate alles live. Offen: Admin-Page, Mails, Sponsor-Banner |
| **Phase E2** (Admin-Tooling, Conflict-Resolution) | ❌ Plan-Stub im E1-Closure-Plan | |
| **Phase E3** (Girocode QR, Pay-Status-Toggle) | ❌ offen | |

## Audit-Trail

- **2026-05-24:** [docs/audits/2026-05-24-onboarding-audit.md](docs/audits/2026-05-24-onboarding-audit.md) — Onboarding-Tiefenprüfung
- **2026-05-24:** [docs/superpowers/plans/2026-05-24-codebase-audit.md](docs/superpowers/plans/2026-05-24-codebase-audit.md) — Erster Codebase-Audit (30 Findings, ~17 inzwischen gefixt)
- **2026-05-25:** [docs/audits/2026-05-25-codebase-audit.md](docs/audits/2026-05-25-codebase-audit.md) — Folge-Audit nach Phase 1-3 + non-custodial Pivot

## Verfügbare Secrets (Coolify + .env.local)

- ✅ DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL
- ✅ RESEND_API_KEY · MAIL_FROM
- ✅ GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
- ✅ APPLE_CLIENT_ID + APPLE_CLIENT_SECRET (pre-signiertes JWT, gültig bis 2026-10-17)
- ✅ STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET + 9 STRIPE_*_PRICE_ID
- ✅ R2_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY + R2_BUCKET (seit `5c5f151`)
- ✅ PLAUSIBLE_DOMAIN (15 instrumentierte Events)
- ❌ INNGEST_SIGNING_KEY in Production — Audit-Task 4.6 macht fail-closed; muss gesetzt sein
- ❌ KICKPACT_ADMIN_EMAILS für `/admin/verifications` — wird in Phase-E1-Closure eingeführt

## Was als nächstes ansteht

### Sofort (Phase-E1-Closure, ~1 Tag)

1. `/admin/verifications` Page + Approve/Reject/Signed-URL-Actions
2. 3 Mail-Templates (submitted/approved/rejected) + `verification-events`-Inngest-Function für Nachversand withheld Invoices
3. Verein/Sponsor-Banner für unverified Clubs (Dashboard + Discover)
4. B-1 Monthly-Cap-Race (atomare Transaktion mit row-lock auf `pledges`)

Detail-Plan: [docs/superpowers/plans/2026-05-25-phase-e1-closure.md](docs/superpowers/plans/2026-05-25-phase-e1-closure.md)

### Cleanup-Sweep (½ Tag, jederzeit zwischendurch)

- `scripts/cleanup-dossenheim3-*` + `seed-dossenheim3-*` löschen (Pilot-Müll)
- `npm remove @neondatabase/serverless` (ungenutzt)
- Hinfällige Pläne archivieren (`docs/superpowers/plans/archive/`)
- TriggerType Single-Source: `lib/validations/pledge.ts` Zod-Array aus `lib/triggers/labels.ts` ableiten

### Phase E2/E3 (eigene Sprints)

- E2: Conflict-Claim-Erweiterung in `/onboarding/zugriff-anfragen` (überlappt mit Identity Phase C — am besten zusammen ziehen)
- E3: Girocode-QR im PDF + Sponsor-Pay-Toggle „bezahlt/offen"

### Plan 6: Production-Domain `kickpact.com`

Weiter blockiert durch DNS + Production-Keys + Stripe-Live-Webhook.

## Tests

- **464 passed | 40 skipped** (53 test files, 9 skipped — Phase-4-Integration-Tests bewusst skipped, plus Live-Smoke nur unter `LIVE=1`)
- TypeScript strict, Build clean
- E2E: Onboarding-Flows + Auth-Redirects abgedeckt

## Bekannte Limitierungen

- Apple-JWT-Rotation manuell alle 5 Monate via `scripts/generate-apple-jwt.mjs`
- Staging + Lokal teilen Neon-DB; sauberer wäre eigener Neon-Branch
- Crawler `0 */6 * * *` hat keinen UA-Rotation/Jitter → fussball.de-Bann-Risiko bei Scale (Phase-5-Fix vorgesehen)
