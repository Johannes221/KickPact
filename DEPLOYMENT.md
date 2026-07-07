# KickPact — Deployment-Strategie

## Übersicht

KickPact hat zwei Umgebungen:

| Umgebung | Branch | Domain | Coolify-App | Zweck |
|---|---|---|---|---|
| **Staging** | `main` | `kickpact.schartl.dev` | `kickpact-staging` | Entwicklung, Tests, Feature-Preview |
| **Production** | `production` | `kickpact.com` | `kickpact-prod` _(anzulegen)_ | Live-Betrieb, Endnutzer |

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

```bash
# Staging smoke-check: https://kickpact.schartl.dev
git checkout production
git merge main
git push origin production
# Coolify deployed automatisch auf kickpact.com
```

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

## Coolify Production-App einrichten (wenn Go-Live)

1. **Coolify Dashboard** → New Application → Source: GitHub `Johannes221/KickPact` → Branch: `production`
2. **Domain**: `kickpact.com` (+ `www.kickpact.com` redirect)
3. **ENVs kopieren** von `kickpact-staging`, dann anpassen:
   - `NEXT_PUBLIC_BASE_URL=https://kickpact.com`
   - `NEXT_PUBLIC_SITE_ENV=production`
   - `SENTRY_ENVIRONMENT=production`
   - `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production`
   - `BETTER_AUTH_URL=https://kickpact.com`
   - Neue DB-URL (Production-DB, separate Instanz)
   - Neue Stripe Live-Keys (`sk_live_...`)
   - **`ALLOW_TEST_AUTH` und `E2E_TEST_BYPASS_KEY` LÖSCHEN** (von Staging
     mitkopiert → würde die Test-Auth-Endpoints auf Production scharf schalten)
4. **Auto-Deploy**: Webhook auf Branch `production` setzen
5. **Cloudflare DNS**: `kickpact.com` → Coolify-IP (A-Record oder CNAME)
6. **Sentry**: Production-Environment in kickpact.sentry.io prüfen

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
