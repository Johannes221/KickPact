# KickPact Autopilot State

> **Live tracking file für die autonome Plan-Implementation.**

## Aktueller Stand

- **Branch:** `main`
- **Live-Domain (Staging):** https://kickpact.schartl.dev — Coolify-App `kickpact-staging`, Auto-Deploy bei Push auf main
- **Letzter Push:** `02fa50b` — Sponsor-Discover feature
- **Aktive Initiative:** Plan 5 Phase B (Vereinslizenz-Logic, Read-Only-Mode, Trial-Reminder)
- **Blocker:** Stripe-Keys (Skeleton aktiv, ohne Keys disabled)

## Plan-Übersicht & Fortschritt

| Plan | Tasks done | Status |
|---|---|---|
| 1 — Foundation | 29/29 ✅ | merged in main |
| 2 — Auth + Onboarding | 21/21 ✅ | merged in main |
| 3 — Match-UI + Approvals | 14/14 ✅ | merged in main |
| 4 — Invoicing + PDF + Mail | 11/12 ✅ | merged in main, Task 12 (E2E) durch Auth-Guards abgedeckt |
| 5 — Stripe-Abo | Phase A done | Skeleton aktiv, Phase B (Vereinslizenz-Logic, Past-Due, Trial-Reminder) offen |
| 6 — Brand + Deploy | Landing + Mobile ✅ | Staging live, Production-Domain offen |

## Extra-Features (außerhalb der Plan-Datei)

| Feature | Status |
|---|---|
| Landing-Rebrand mit Hero + Stories + Bildern | ✅ live |
| Mobile-First-Audit für alle Pages | ✅ |
| Rotating-Trigger-Animation im Hero | ✅ |
| OAuth: Google + Apple Sign-in | ✅ live auf Staging |
| Sponsor-Discover-Feature (Spec §6.10) | ✅ live (Admin-UI Phase 2 offen) |
| Coolify-Deploy mit Playwright-Dockerfile | ✅ live |
| Drizzle 0.36 → 0.45 Upgrade | ✅ |
| Saison-Wetten in Marketing + FAQ + Spec | ✅ Marketing, Backend offen |

## Verfügbare Secrets (Coolify + .env.local)

- ✅ DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL · RESEND_API_KEY · MAIL_FROM
- ✅ GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Vaultwarden)
- ✅ APPLE_CLIENT_ID + APPLE_CLIENT_SECRET (vor-signiertes JWT, gültig bis 2026-10-17, Vaultwarden)
- ❌ R2_* (Plan 4 — Storage fällt auf `/tmp/kickpact-pdfs/` zurück)
- ❌ STRIPE_* (Plan 5 — Skeleton aktiv, Checkout disabled)

## Was als nächstes ansteht

### Plan 5 Phase B — Stripe Production-Ready

- Vereinslizenz-Logic: `parent_club_license_id` subsumiert Team-Lizenzen unter
  einer Vereins-Subscription
- Read-Only-Mode wenn `subscription.status = past_due` länger als 7d
- Trial-Reminder-Cron 7d/3d/1d vor Ablauf
- Stripe-Customer automatisch beim Onboarding anlegen (statt erst beim Checkout)

### Plan 6 — Production-Domain

- `kickpact.com` als zweite Coolify-App (parallel zu Staging)
- DNS, SSL, Build-Pack identisch zu Staging
- ENV: production-Stripe-Keys + production-RESEND-Setup
- DSGVO/Impressum/Datenschutz-Seiten

### Saison-Wetten Backend

- Spec §5.3: 6 neue trigger_types (season_promotion, season_no_relegation, season_table_position, season_champion, season_cup_round, season_custom)
- Inngest `evaluate-season` Cron — 24h nach offiziellem Saison-Ende
- UI in PledgeBuilder + match-events damit Sponsoren Saison-Wetten anlegen können

### Eltern-Proxy für Junioren-Sponsoring

- Spec §6.2: `sponsors.pledge_proxies_json` für Eltern-als-Manager
- UI im Sponsor-Onboarding um Sub-Sponsoren zu listen
- Rechnungs-Builder muss die Proxies auflisten

### Sponsor-Discover Phase 2

- Admin-UI auf `/verein/[slug]/sponsoren` für Inquiries-Liste mit Accept/Reject-Buttons
- Toggle "discoverable" im Mannschafts-Dashboard
- Public-Tagline-Editor

## Bekannte Limitierungen

- **R2-Storage** nicht konfiguriert — PDFs landen lokal in `/tmp/kickpact-pdfs/`
- **Stripe** Skeleton aktiv, aber ohne Keys keine echten Checkouts
- **Apple-JWT-Rotation**: aktuell manuell alle 5 Monate via `scripts/generate-apple-jwt.mjs`
  → später Inngest-Cron der das DB-stored macht
- **DB-Branch fürs Staging**: Staging + Lokal teilen aktuell die Neon-DB. Sauberer wäre
  ein eigener Neon-Branch.
