# KickPact — Deployment-Strategie

## Übersicht

KickPact hat zwei Umgebungen:

| Umgebung | Branch | Domain | Coolify-App | Zweck |
|---|---|---|---|---|
| **Staging** | `main` | `kickpact.schartl.dev` | `kickpact-staging` | Entwicklung, Tests, Feature-Preview |
| **Production** | `production` | `kickpact.com` | `kickpact-prod` (UUID `am5tp3laz3p9t3wzh3vt8xpj`, angelegt 2026-07-16) | Live-Betrieb, Endnutzer |

---

## Branching-Regeln

```
feature/xyz  ──►  main (staging)  ──►  production
```

### Was wohin geht

- **Alle Feature-Entwicklung** → Branch von `main` → PR → `main`
- **Release auf Production** → `main` → `production` mergen (kein direkter Commit)
- **Hotfixes** → Branch von `production` → fix → PR auf `production` UND `main` (Cherry-Pick oder separater PR)

### Was NICHT passiert

- ❌ Niemals direkt in `production` committen
- ❌ Niemals einzelne Commits cherry-picken (immer `main → production` mergen, um Divergenz zu vermeiden)
- ❌ Niemals force-push auf `main` oder `production`

---

## Deployment-Flow

### Feature entwickeln (täglich)

```bash
git checkout main && git pull
git checkout -b feature/mein-feature
# ... entwickeln, testen ...
git push origin feature/mein-feature
# PR auf main → review → merge → Auto-Deploy auf Staging
```

### Release auf Production

Wenn auf der Demo/Test-Instanz (`main` → kickpact.schartl.dev) alles geprüft ist:

```bash
# Staging/Demo smoke-check: https://kickpact.schartl.dev
npm run promote:prod        # = git push origin main:production (Fast-Forward)
# Coolify (kickpact-prod) deployt automatisch auf kickpact.com
```

`promote:prod` schiebt `main` per Fast-Forward auf `production` — kein lokaler
Branch-Wechsel, keine Divergenz. Schlägt der Push fehl (production ist
divergiert), NICHT force-pushen, sondern erst `main` mit production versöhnen.

### iOS-Build bei einem Prod-Release

Die iOS-App ist ein Remote-WebView auf kickpact.com — ein Web-Release (obiges
Promote) geht **sofort** in die installierte App, ohne Store-Rebuild. Ein neuer
**nativer** iOS-Build ist nur nötig, wenn sich Natives ändert (Capacitor-Plugins,
Info.plist, Entitlements, App-Icon, `server.url`):

```bash
npm run ios:sync:prod       # CAP_SERVER_URL=https://kickpact.com → cap sync ios
# dann: Xcode → Product → Archive → App Store Connect / TestFlight
```

`ios:sync:prod` pinnt die Prod-Domain in den Build. Der native Archive-/Upload-
Schritt braucht macOS + Apple-Signing und läuft NICHT in Coolify — manuell in
Xcode oder später via macOS-CI (GitHub Actions + fastlane, Apple-Keys als CI-
Secrets). Siehe iOS-Launch-Checkliste unter `docs/superpowers/plans/`.

---

## Umgebungsvariablen — Unterschiede

| Variable | Staging | Production |
|---|---|---|
| `NEXT_PUBLIC_BASE_URL` | `https://kickpact.schartl.dev` | `https://kickpact.com` |
| `NEXT_PUBLIC_SITE_ENV` | `staging` | `production` |
| `SENTRY_ENVIRONMENT` | `staging` | `production` |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `staging` | `production` |
| `BETTER_AUTH_URL` | `https://kickpact.schartl.dev` | `https://kickpact.com` |
| `ALLOW_TEST_AUTH` | `true` | **NICHT setzen** |
| `E2E_TEST_BYPASS_KEY` | gesetzt (Vaultwarden) | **NICHT setzen** |

Alle anderen Secrets (DB, Stripe, Resend etc.) sind in **Vaultwarden** hinterlegt.

### 🇪🇺 Datenregion — verpflichtend EU (DSGVO)

KickPact verarbeitet personenbezogene Daten (Vereinsmitglieder, Sponsoren,
Spieler). Alle datenhaltenden Dienste **müssen in einer EU-Region** laufen —
beim Provisioning aktiv prüfen, nicht auf Provider-Defaults verlassen:

| Dienst | Anforderung | Prüfen |
|---|---|---|
| **Neon Postgres** (`DATABASE_URL`) | Region **EU (Frankfurt / `eu-central-1`)** | Neon-Console → Project → Region; der Default kann `us-east` sein |
| **Cloudflare R2** (`CLOUDFLARE_R2_*`) | Jurisdiction/Location Hint **EU** | Bucket mit `--jurisdiction eu` bzw. Location `EEUR` anlegen |
| **Hetzner/Coolify** (App-Hosting) | Standort **DE (Nürnberg/Falkenstein)** | bereits EU (schartl.dev) |

US-/Dritt-Dienste mit PII-Berührung (Stripe, Apple, Resend, Sentry) laufen unter
DPA/SCC; PII wird vor Übermittlung minimiert (Sentry `sendDefaultPii=false`,
`maskAllText`). Neue Sub-Prozessoren nur mit AVV.

### ⚠️ Test-Auth-Endpoints (`/api/test-auth/*`)

Die Endpoints `/api/test-auth/magic-link-stub` und `/api/test-auth/cleanup`
erlauben Playwright-E2E-Tests, Sessions für beliebige E-Mails zu erzeugen bzw.
Test-Daten zu löschen. Sie sind doppelt gesichert:

1. **Production-Gate:** In Production-Builds antworten sie 404, außer
   `ALLOW_TEST_AUTH=true` ist gesetzt. Staging läuft als Production-Build und
   braucht das Flag, damit E2E-Tests funktionieren.
2. **Key-Check:** Header `x-test-bypass` muss `E2E_TEST_BYPASS_KEY` matchen.

Auf **kickpact.com dürfen `ALLOW_TEST_AUTH` und `E2E_TEST_BYPASS_KEY` niemals
gesetzt werden** — dann sind die Endpoints hart deaktiviert, unabhängig vom Key.

### SEO-Auswirkung von `NEXT_PUBLIC_SITE_ENV`

- `staging`: `robots.txt` sendet `Disallow: /` → Google indexiert nichts
- `production`: `robots.txt` erlaubt öffentliche Seiten, `sitemap.xml` aktiv
- Alles andere (leer, undefined): verhält sich wie `staging` → safe default

---

## Coolify Production-App einrichten (Status 2026-07-16)

1. ✅ **Coolify App angelegt**: `kickpact-prod` (UUID `am5tp3laz3p9t3wzh3vt8xpj`), Source: Deploy-Key `git@github.com:Johannes221/KickPact.git` → Branch: `production`, Dockerfile-Build, Port 3000, Health-Check `/api/health`
2. ✅ **Domain**: `kickpact.com` + `www.kickpact.com` (redirect: both) — von `kickpact-staging` entfernt (lief vorher fälschlich auf allen 3 Domains)
3. ⏳ **ENVs**: 6 nicht-geheime Prod-Werte gesetzt (`NEXT_PUBLIC_BASE_URL`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_ENV=production`, `SENTRY_ENVIRONMENT=production`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`, `APNS_PRODUCTION=true`). 53 Secret-Keys als **leere Platzhalter** angelegt (Namen 1:1 aus Staging übernommen, Werte fehlen bewusst — Claude trägt keine Secrets ein). `ALLOW_TEST_AUTH`/`E2E_TEST_BYPASS_KEY` bewusst NICHT angelegt.
   - **Johannes-TODO**: Secret-Werte in Coolify-UI (`kickpact-prod` → Environment Variables) eintragen. Manche liegen schon in Vaultwarden: „KickPact R2 — kickpact-prod", „KickPact Sentry — Auth Token", „KickPact APNs", „KickPact — App Store Connect API (IAP)", „KickPact — Google iOS OAuth". Rest (DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, STRIPE Live-Keys + Price-IDs, INNGEST_*, GOOGLE_CLIENT_*, APPLE_CLIENT_*) selbst pflegen — **Stripe-Keys müssen `sk_live_...` sein**, nicht die Test-Keys von Staging.
4. ⏳ **Neue Prod-Neon-DB** (EU/Frankfurt), isoliert von der geteilten Staging/Test-DB: Neon-Console → New Project „kickpact-prod", Region Frankfurt → gepoolten `-pooler`-Connection-String als `DATABASE_URL` eintragen. Migrationen 0000–0068 laufen automatisch beim ersten Deploy (Post-Deploy-Command).
5. ⏳ **Auto-Deploy**: Webhook-Secrets sind angelegt (analog Staging); GitHub-Webhook auf dem Repo deckt vermutlich beide Branches automatisch ab (Coolify matched serverseitig auf Branch) — bei erstem Push auf `production` verifizieren, dass Deploy triggert.
6. ⏳ **Cloudflare DNS**: `kickpact.com` ist auf Cloudflare-NS, aber NICHT im schartl-assistant-CF-Account/Token sichtbar → Johannes muss selbst A-Records setzen: `kickpact.com` + `www.kickpact.com` → `178.104.49.158` (DNS-only/nicht proxied, wie alle anderen Apps auf diesem Server). Aktuell kein DNS-Eintrag vorhanden.
7. ⏳ **Sentry**: Production-Environment in kickpact.sentry.io prüfen
8. ⏳ **Erster Deploy**: erst NACH Secrets+DB — ein Boot-Versuch mit leeren Secrets schlägt gewollt am Fail-Fast-Validator fehl (kein Bug).

---

## Wo was zu finden ist

| Thema | Ort |
|---|---|
| Staging URL | https://kickpact.schartl.dev |
| Coolify Dashboard | https://coolify.schartl.dev |
| Sentry | https://kickpact.sentry.io |
| Linear | https://linear.app/kickpact |
| Vaultwarden (Secrets) | https://vault.schartl.dev |
| Cloudflare | https://dash.cloudflare.com |
