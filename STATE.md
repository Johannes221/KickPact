# KickPact Autopilot State

> **Live tracking file für die autonome Plan-Implementation.**

## Aktueller Stand

- **Branch:** `main`
- **Live-Domain (Staging):** https://kickpact.schartl.dev — Coolify-App `kickpact-staging`, Auto-Deploy bei Push auf main
- **Letzter Push:** `b66cbf6` — Stripe Hard-Gate (assertClubWriteAccess + Crawler-Skip)
- **Aktive Initiative:** Plan 6 (Production-Domain `kickpact.com`)
- **Blocker:** Stripe-Production-Keys, R2-Keys, Production-DNS

## Plan-Übersicht & Fortschritt

| Plan | Tasks done | Status |
|---|---|---|
| 1 — Foundation | 29/29 ✅ | merged in main |
| 2 — Auth + Onboarding | 21/21 ✅ | merged in main |
| 3 — Match-UI + Approvals | 14/14 ✅ | merged in main |
| 4 — Invoicing + PDF + Mail | 11/12 ✅ | merged in main, Task 12 (E2E) durch Auth-Guards abgedeckt |
| 5 — Stripe-Abo | Phase A + B done | Skeleton + Trial-Reminder + Hard-Gate live. Keys-Setup für echte Charges offen. |
| 6 — Brand + Deploy | Staging ✅ | Production-Domain `kickpact.com` setup offen |

## Extra-Features (außerhalb der Plan-Datei)

| Feature | Status |
|---|---|
| Landing-Rebrand mit Hero + Stories + Bildern | ✅ live |
| Mobile-First-Audit für alle Pages | ✅ |
| Rotating-Trigger-Animation im Hero | ✅ |
| OAuth: Google + Apple Sign-in | ✅ live auf Staging |
| Sponsor-Discover (Spec §6.10) inkl. Admin-UI | ✅ live |
| Coolify-Deploy mit Playwright-Dockerfile | ✅ live |
| Drizzle 0.36 → 0.45 Upgrade | ✅ |
| Saison-Wetten Marketing + Backend + UI | ✅ live |
| Eltern-Proxy für Junioren (Spec §6.2) | ✅ live, Migration `0005` |
| DSGVO / Impressum / AGB | ✅ live (Platzhalter-Daten) |
| Read-Only-Hard-Gate für past_due Clubs | ✅ live |
| Trial-Reminder-Cron 7/3/1d | ✅ live |
| Crawler-Skip bei read-only Clubs | ✅ live |

## Verfügbare Secrets (Coolify + .env.local)

- ✅ DATABASE_URL · BETTER_AUTH_SECRET · BETTER_AUTH_URL · NEXT_PUBLIC_BASE_URL · RESEND_API_KEY · MAIL_FROM
- ✅ GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (Vaultwarden)
- ✅ APPLE_CLIENT_ID + APPLE_CLIENT_SECRET (vor-signiertes JWT, gültig bis 2026-10-17, Vaultwarden)
- ❌ R2_* (Plan 4 — Storage fällt auf `/tmp/kickpact-pdfs/` zurück)
- ❌ STRIPE_* (Plan 5 — Skeleton aktiv, Checkout disabled; User muss Stripe-Account anlegen + Price-IDs erzeugen, siehe `docs/stripe-setup.md`)

## Was als nächstes ansteht

### Plan 6 — Production-Domain `kickpact.com`

- Cloudflare-DNS für `kickpact.com` einrichten (analog zu kickpact.schartl.dev Staging)
- Coolify-App `kickpact-production` analog zu Staging anlegen, Branch=main
- ENV setzen: BETTER_AUTH_URL+NEXT_PUBLIC_BASE_URL auf `https://kickpact.com`
- Stripe-Live-Keys + Webhook auf `https://kickpact.com/api/stripe/webhook`
- Apple Services-ID um `kickpact.com`-Return-URL erweitern
- Google OAuth-Console: Authorized origins + redirect URIs für kickpact.com ergänzen
- Production-DB: eigener Neon-Branch (statt Staging-DB)

### Plan 5 Phase C — Vereinslizenz

- `team_licenses.parent_club_license_id` Logic: wenn Verein Vereinslizenz-Abo hat,
  werden Mannschafts-Lizenzen unter dem Abo subsumiert, nicht einzeln gechargt
- UI-Flag im Onboarding-Wizard Step 2 (Plan-Auswahl) für "Vereinslizenz wählen"
- Master-Admin-Cockpit `/verein/[slug]/admin` mit Cross-Team-Übersicht

### R2-Storage für PDFs (statt /tmp/)

- Cloudflare R2-Bucket anlegen + IAM für KickPact-Service
- ENV: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
- Bestehender `lib/invoicing/storage.ts` aktiviert sich automatisch wenn alle 4 gesetzt sind
- Migration für bestehende PDFs (falls Production schon Rechnungen erzeugt hat)

### Apple-JWT-Auto-Rotation (nice-to-have)

- Inngest-Cron alle 4 Monate: neues JWT signieren + in DB-Tabelle `apple_secrets` speichern
- `lib/auth/server.ts` liest aus DB statt aus Env
- Eliminiert manuelle Rotation

## Bekannte Limitierungen

- **R2-Storage** nicht konfiguriert — PDFs landen lokal in `/tmp/kickpact-pdfs/`
- **Stripe** Skeleton aktiv, aber ohne Keys keine echten Checkouts
- **Apple-JWT-Rotation**: aktuell manuell alle 5 Monate via `scripts/generate-apple-jwt.mjs`
- **DB-Branch fürs Staging**: Staging + Lokal teilen aktuell die Neon-DB. Sauberer wäre ein eigener Neon-Branch.

## Tests

- 65 passing (+11 für `gateFromSubscription` Pure-Function)
- 6 skipped (Crawler-DOM-Tests + evaluate-match-E2E — brauchen Browser oder mock-Setup)
- TypeScript strict, Build clean, alle 25 Routes generieren ohne Errors

## Commits dieser Auto-Session (chronologisch)

1. `bae10cc` — KickPact-Branded Teamfotos + originale Logo-Typo im Header
2. `a647911` — Hero-Foto ohne aufgebranntes Wasserzeichen + Gradient stärker
3. `b7cd355` — Magic-Link-Mail wirklich verschicken statt Sandbox-Fallback
4. `0ec5bd7` — Hero Glass-Panel statt Gradient
5. `e9cd83b` — Google + Apple Sign-in
6. `d80fcc7` — Mobile-First Refactor + Saison-Wetten + Jugend/Eltern-Story
7. `7e010f4` — App-weite Mobile-First-Optimierung
8. `f3c0a80` — Benefits-Section + Branding Mannschaft + Vereinslizenz
9. `93ededf` — Apple JWT als pre-signed statt boot-time
10. `c71b53d` — Docker für Playwright + Coolify-Setup
11. `f2c396b` — Hero-Formula + €/Spieler Pricing + Inline-CTAs
12. `014a3b3` — Mannschaft-Sprache + Hero smoother + Dashboard-CTA
13. `3be8fc1` — Rotating-Trigger im Hero
14. `9ea9ae6` — OAuth invitation-token weitergeben + Onboarding-Optionals
15. `f6412f0` — Plan 4 Invoicing komplett (Tasks 6–11)
16. `b08e877` — Drizzle 0.36→0.45 Upgrade
17. `98c90a5` — Stripe Abo-Skeleton (Checkout + Webhook + Abo-Page)
18. `02fa50b` — Sponsor-Discover Feature (§6.10)
19. `1e68dbc` — STATE Update
20. `2a7ab1a` — Discover Admin-UI (Inquiry-Inbox + Discoverability-Toggle)
21. `f368c27` — Saison-Wetten Backend
22. `6baa1b7` — Saison-Ergebnis-Form auf Mannschaft-Page
23. `1f89abb` — Pledge-Builder erweitert um Saison-Trigger
24. `6d85ee6` — 22 evaluate-season Tests + Status-Page-Update
25. `b7700b0` — Trial-Reminder-Cron + Past-Due-Banner + getSubscriptionGate
26. `87f74bf` — Impressum + Datenschutz + AGB + Footer-Links
27. `bc9afdf` — Eltern-Proxy für Junioren-Sponsoring
28. `b66cbf6` — Stripe Phase B Hard-Gate (assertClubWriteAccess + Crawler-Skip)
