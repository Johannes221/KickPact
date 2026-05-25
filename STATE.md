# KickPact State

> **Live-Snapshot des aktiven Repos.** Bei jedem größeren Merge updaten.
> Letztes Konsolidieren: 2026-05-25 20:00 — alle ~7 Parallel-Sessions des Tages zusammengeführt + Worktrees gereinigt.

## Stand

- **Branch:** `main` (synced mit `origin/main`)
- **Staging:** https://kickpact.schartl.dev (Coolify-Auto-Deploy on push)
- **Letzter Commit:** `23f4021` — feat(admin): platform-tooling expansion + verein-sub-nav pledges/charges
- **Aktive Initiative:** keine — Tag konsolidiert, bereit für sauberen Neustart morgen
- **Working-Tree:** clean (alle WIP aus Parallel-Sessions committed)
- **Worktrees:** clean (alle 9 stale agent-* removed, `phase2-audit` gelöscht — nur noch `main`)
- **Stashes:** keine

## Heute gebaut (~92 Commits seit 00:00)

Gruppiert nach Initiative — die ursprünglich auf ~7 Parallel-Sessions verteilte Arbeit:

| Initiative | Status | Source-Session |
|---|---|---|
| **Onboarding-Rebuild P1-P7** (Schema + 3-Step Wizard + Draft-Resume + Role-aware Routing) | ✅ live | „Onboarding flow issues" |
| **Login-SSR-Race Fix** (LoginSessionGuard → revert + NEXT_REDIRECT-Server-Action-Fix `3d5bd9b`) | ✅ live | „Onboarding flow issues" |
| **Phase E1+E2+E3 Verifications** (Schema + Upload + Withhold-Gate + Admin-Tooling + Conflict-Claim + 3 Mails + Banner + Girocode-QR) | ✅ live | „Kickpact" |
| **Team-Centric Dashboard** (effectivePlan-Routing + Layout + Pacts/Spiele/Finanzen/Spieler-Tabs + Hart-Redirect + Nav-Dedup) | ✅ live | „Kickpact 2" |
| **Reporting + CSV + Filter** (paginate-Helper + DataTable + FilterBar + CsvExportButton + Sponsor /charges + /bilanz + Verein /pledges + /charges + /sponsor/[id] + Sponsor-Dashboard-Tiles) | ✅ live | „kickpact logik audit" |
| **Mannschafts-Lifecycle** (Team-Logo-Upload + CRUD + /mannschaften/neu + Spieler-Roster + /spieler-opt-out + Match-Event-Editor + Result-Override) | ✅ live | „kickpact logik audit" (Plan 3) |
| **Admin-Platform-Tooling** (dashboard mit MRR-Chart + users + vereine + crawler + stripe + mail Admin-Pages + platform-stats + crawler-health queries) | ✅ live (`23f4021`) | „Kickpact 2" oder „Scraping" — uncommitted bis 20:00, dann konsolidiert |
| **Season-Renewal-Cron** (Token + Inngest-Job + Mail-Template + /season-renewal-Page + Server-Actions) | ✅ live (`f10121c`) | unklar — uncommitted bis 19:50, dann konsolidiert |
| **DSGVO Phase 4+5** (Magic-Link Rate-Limit + PII-Mask + Account-Export + Anonymize-Cron + Perf-Indexes) | ✅ live | „kickpact logik audit" |
| **Konto/DSGVO-UI** (/konto-Page + Cookie-Banner + DSGVO-Actions im Header) | ✅ live | „Feature catalog by user" |
| **Help-Center** (27 Markdown-Artikel + /hilfe-Routes) | ✅ live | unklar |
| **Feature-Catalog Gap-Analyse + Roadmap** (Soll/Ist über alle Rollen) | ✅ docs | „Feature catalog by user" |
| **Plan 6 Production-Deploy** | 📝 Draft (484 Zeilen, 77 Steps) — wartet auf User-GO | „Kickpact" |

## Plan-Status (kompakt)

| Plan / Spec | Status |
|---|---|
| Foundation v1, Auth + Onboarding (alt), Match-UI, Invoicing, Pricing v2, Identity A-C, Team-Member-Invitations, Audit-Fix 1-5, Phase E1-E3, Help-Center | ✅ live (Tag-1 bis Tag-7) |
| Onboarding-Rebuild (P1-P7) | ✅ live (heute) |
| Mannschafts-Lifecycle (Plan 3 Teil 1) | ✅ live (heute) |
| Admin-Platform-Tooling (Gap-Fix Plan 4 vorgezogen) | ✅ live (heute) |
| Season-Renewal | ✅ live (heute) |
| Team-Centric Dashboard | ✅ ~95% (5 Sub-Pages + Query-Layer; Wiring der gesalvageten Queries in Pages noch offen — kosmetisches Refactor) |
| Identity Phase D (Mobile-IA-Tiles) | ⚠️ teilweise (Team-centric deckt vieles ab) |
| Plan 6 Production-Domain `kickpact.com` | 📝 Draft (wartet auf User) |
| **Gap-Fix Plans 5+6 (Notifications + …)** | 📝 noch nicht angefangen |

## Audit-Trail

- **2026-05-24:** [docs/audits/2026-05-24-onboarding-audit.md](docs/audits/2026-05-24-onboarding-audit.md) — Onboarding-Tiefenprüfung (Input für Rebuild)
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

## Was morgen ansteht — DIREKTIVE

### Priorität 1: User testet Onboarding-Flow

Mit dem `3d5bd9b` NEXT_REDIRECT-Fix + `fc976ba` Login-Guard-Revert sollte der Wizard jetzt:
- Bei frischer Mannschaft-Anmeldung sauber durchlaufen (Step 1 → 2 → 3 → Mannschaft-Dashboard)
- Session-Verlust während Server-Action ergibt klare „Session abgelaufen"-Toast + Hard-Reload zu /login (statt „NEXT_REDIRECT")
- Verein-Flow analog mit Multi-Team-Select

Wenn Bug auftritt → DevTools Network-Tab Screenshot ist **das** Diagnose-Tool.

### Priorität 2: Test-Suite grün kriegen (~30 min)

Per Inventur-Agent: **82 Tests rot** — ein Cluster (~40+) sind Season-Renewal FK-Violations weil das Feature jetzt committed ist aber das resetTestDb-Setup nicht weiß. Der Rest braucht Bisect.

```bash
npx vitest run 2>&1 | tail -100
# → herausfinden welche Test-Files fail, geziel reparieren
```

### Priorität 3: E2E-Tests rewriten für neuen Onboarding-Wizard

`tests/e2e/01-onboarding.spec.ts`, `onboarding-flows.spec.ts`, `scraper-flow/verein-onboarding.spec.ts` referenzieren noch alte `/onboarding/verein/1..5` URLs. Eigener kleiner Plan (~1h).

### Priorität 4 (entscheiden): Plan 6 Production-Deploy?

Wenn User GO sagt → kickpact.com domain flip + Stripe LIVE + Resend Production-Domain. Ohne grüne Tests = riskant.

### Cleanup-Sweep (½ Tag, jederzeit)

- `scripts/cleanup-dossenheim3-*` + `seed-dossenheim3-*` löschen
- `npm remove @neondatabase/serverless` (ungenutzt)
- Hinfällige Pläne nach `docs/superpowers/plans/archive/` verschieben (alle vor `2026-05-25`)
- `CLAUDE.md` aktiver-Plan-Pointer aktualisieren (zeigt noch auf Foundation-Plan von Mai-19)
- `AUTOPILOT_PROMPT.md` refresh (Tippfehler + Plans 2-4 sind durch)
- TriggerType Single-Source: `lib/validations/pledge.ts` Zod-Array aus `lib/triggers/labels.ts` ableiten

## Tests

- **Stand 20:00:** 533 passed | 82 failed | 85 skipped (per Inventur-Agent, 700 total)
- Failures konzentriert auf Season-Renewal FK-Setup (40+) + offene Cluster zu bisect
- TypeScript strict, Build clean
- E2E: alte Onboarding-Specs rot (referenzieren gelöschte Routes)

## Bekannte Limitierungen

- Apple-JWT-Rotation manuell alle 5 Monate via `scripts/generate-apple-jwt.mjs`
- Staging + Lokal teilen Neon-DB; sauberer wäre eigener Neon-Branch (Plan-6-Scope)
- Crawler `0 */6 * * *` — Phase-5 reduziert N+1, aber UA-Rotation/Jitter noch offen (low prio bis Skalierung)
- **Better-Auth SSR-Cookie intermittierend nicht sichtbar** — Symptom war NEXT_REDIRECT-Leak in Server-Actions (heute via `requireUserOrThrow` umschifft), tieferer Cookie-Bug noch nicht root-cause-gefixt. Falls Symptom in anderer Form auftritt: BETTER_AUTH_URL env + Coolify Reverse-Proxy Headers verdächtig.

## Setup für morgen — Single-Session-Mode

User möchte alle 7 Parallel-Sessions schließen und morgen in **EINER Session mit mehreren Agents** weiterarbeiten. Aktueller Stand erlaubt das:

- ✅ Alle WIP committed
- ✅ Alle 9 stale Worktrees removed
- ✅ Branches clean (`main` only)
- ✅ Stashes leer
- ✅ Origin synced
- ✅ Coolify deployt automatisch beim nächsten Push

**Risiko:** Falls noch eine andere Session beim Schließen versucht zu committen mit alten Schemas/Files, kann es zu Konflikten kommen. Empfehlung: einfach alle Tabs schließen — bei Datenverlust kann man im Reflog (`git reflog`) nachschauen, aber laut Inventur ist alles drin.

**Morgen Start:**
1. Diese STATE.md lesen für Kontext
2. `npm test` für Test-Health-Check
3. Test-Cluster bisect (vermutlich Season-Renewal FK + 1-2 weitere)
4. Wenn grün → User entscheidet Plan 6 oder andere Initiative
