# Plan 6: KickPact Production-Deploy auf `kickpact.com`

> **Status:** Draft — User entscheidet, wann gemerged + ausgeführt wird.
> **Owner:** Johannes (DNS-/Coolify-/Stripe-/Apple-Konsolen liegen bei ihm).
> **Scope:** Reine Operations — keine Code-Änderungen, kein neuer Feature-Code. Plan beschreibt Setup, ENV-Mapping, Smoke-Tests, Rollback. Falls etwas im Code geändert werden muss (z.B. Healthcheck-Endpoint, R2-CORS-Origin), wird das in einem getrennten Plan getrackt.
> **Source of Truth Spec:** [docs/superpowers/specs/2026-05-19-kickpact-v1-design.md](../specs/2026-05-19-kickpact-v1-design.md), [docs/superpowers/specs/2026-05-25-trust-and-payment-model-design.md](../specs/2026-05-25-trust-and-payment-model-design.md) (non-custodial Stripe-Modell).

**User-Entscheidungen 2026-05-25 (binding):**
1. **Branch-Modell:** `main` = Staging (deployt nach `kickpact.schartl.dev`), `production` = Production (deployt nach `kickpact.com`). Promotion explizit per `git push origin main:production`. Hotfixes laufen denselben Pfad.
2. **Stripe bleibt Test-Mode für Launch** — echte Charges disabled. Pilot-Vereine durchlaufen kompletten Flow mit Test-Cards (`4242…`). Live-Aktivierung ist ein separater, späterer Schritt (Sektion 5.1-5.7 dokumentiert für später, **nicht für Launch** auszuführen).
3. **R2-Bucket separieren:** Production nutzt einen neuen Bucket `kickpact-prod` mit eigenen API-Tokens. Staging-Bucket bleibt unverändert.

**Ziel:** `https://kickpact.com` ist live, erreichbar, HTTPS, OAuth-Logins gehen, Stripe-Test-Webhook nimmt Events, Resend-Mails kommen mit verifizierter Domain, Inngest-Crons laufen signiert, Plausible trackt — und der Rollback-Pfad auf Staging ist dokumentiert.

**Aktuelle Infrastruktur (Stand 2026-05-25):**
- Staging: `https://kickpact.schartl.dev` via Coolify, Auto-Deploy bei Push auf `main`.
- DB: Neon Postgres (Staging-Branch shared mit lokaler Dev — `STATE.md` Z. 90).
- Storage: Cloudflare R2 (live seit `5c5f151`).
- Mail: Resend (Sandbox bis `MAIL_FROM`-Domain verifiziert ist).
- Async: Inngest (lokaler `inngest:dev`-Server; Production-Project + Signing-Key fehlen — `STATE.md` Z. 51).
- Auth: BetterAuth (Magic-Link + Google + Apple, Apple-JWT pre-signed gültig bis 2026-10-17).
- Payments: Stripe Test-Mode, 9 Test-Price-IDs in Staging-Coolify-ENV — Live-Modus noch nicht aktiviert.
- Analytics: Plausible (`PLAUSIBLE_DOMAIN=kickpact.de` aktuell; muss auf `kickpact.com` wechseln).

**Pre-Reqs (vor Sektion 1 erledigen):**
- [ ] Domain `kickpact.com` ist im Cloudflare-Account, Nameserver auf Cloudflare delegiert.
- [ ] Coolify-Server-IP und SSH-Zugang dokumentiert (siehe Staging-App).
- [ ] Zugang zu Stripe-, Apple-Dev-, Google-Cloud-, Resend-, Plausible-, Inngest-Konsolen vorhanden.
- [ ] Letzter grüner CI-Run auf `main` — niemals nach `production` mergen aus rotem `main`.
- [ ] DB-Backup von Staging gezogen, bevor neuer Production-Branch angelegt wird (Sektion 4 referenziert ihn).
- [ ] Neuer Git-Branch `production` lokal erstellt + auf GitHub gepusht: `git checkout main && git pull && git checkout -b production && git push -u origin production`. Branch-Protection auf GitHub: `production` → nur Merge von `main`, keine direkten Commits, kein force-push.

---

## Sektion 1 — DNS-Setup (Cloudflare)

**Quelle:** [Cloudflare DNS docs](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/).

- [ ] **1.1 — Server-IP von Coolify ermitteln**
  Coolify-Server-Adresse vom Staging-Setup übernehmen (gleicher Server). In Coolify-UI: *Servers → Default → IPv4/IPv6 address*. Notieren als `$COOLIFY_IPV4` (und `$COOLIFY_IPV6` falls vorhanden).

- [ ] **1.2 — DNS-Records mit niedriger TTL anlegen**
  Cloudflare-Dashboard → `kickpact.com` → *DNS → Records → Add record*. TTL bewusst auf **300 s** (5 min), damit Rollback (Sektion 11) schnell greift. **Proxy-Status: DNS-only (graue Wolke)** für die ersten 24 h, damit Let's-Encrypt-HTTP-01-Challenge in Coolify durchgeht; nach SSL-Success kann optional auf Proxied (orange Wolke) umgeschaltet werden.

  | Typ | Name | Wert | TTL | Proxy |
  |---|---|---|---|---|
  | A | `@` (kickpact.com) | `$COOLIFY_IPV4` | 300 | DNS-only |
  | AAAA | `@` | `$COOLIFY_IPV6` (falls vorhanden) | 300 | DNS-only |
  | CNAME | `www` | `kickpact.com` | 300 | DNS-only |
  | CNAME | `staging` *(optional)* | `kickpact.schartl.dev` | 300 | DNS-only |

- [ ] **1.3 — Mail-Records (Resend) vorbereiten**
  Quelle: [Resend Domain Verification](https://resend.com/docs/dashboard/domains/introduction). Entscheidung: Mail-Versand-Subdomain ist `mail.kickpact.com` (Resend best practice — trennt Reputation vom Apex-Domain falls Apex später für Newsletter etc. genutzt wird). Resend zeigt die exakten Werte für SPF/DKIM/DMARC nach Domain-Anlage. Erwartete Records:

  | Typ | Name | Wert (Beispielmuster — exakte Werte aus Resend) | TTL |
  |---|---|---|---|
  | MX | `mail` | `feedback-smtp.eu-west-1.amazonses.com` priority 10 | 300 |
  | TXT | `mail` (SPF) | `v=spf1 include:amazonses.com ~all` | 300 |
  | TXT | `resend._domainkey.mail` (DKIM) | `p=…` (langer Key aus Resend) | 300 |
  | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@kickpact.com` | 300 |

- [ ] **1.4 — Propagation prüfen**
  Mindestens 1 min warten, dann verifizieren:
  ```bash
  dig +short kickpact.com A
  dig +short www.kickpact.com CNAME
  dig +short mail.kickpact.com TXT
  ```
  Erwartung: jeweils der gerade gesetzte Wert (oder leer, falls Propagation noch nicht durch — dann bis 10 min warten).

---

## Sektion 2 — Coolify-App `kickpact-production`

**Quelle:** [Coolify docs — Application](https://coolify.io/docs/applications/dockerfile).

- [ ] **2.1 — Neue App anlegen**
  Coolify-UI → *Projects → KickPact → + New Resource → Application → Public Repository*.
  - **Name:** `kickpact-production`
  - **Repository:** `https://github.com/Johannes221/KickPact`
  - **Branch:** `production` (User-Entscheidung 2026-05-25 — **Zwei-Phasen-Setup**: `main`-Branch deployt automatisch nach `kickpact.schartl.dev` (Staging-App `kickpact-staging`, bereits live), `production`-Branch deployt automatisch nach `kickpact.com` (diese neue App). Promotion-Workflow: `git push origin main:production` (oder GitHub-UI Merge/PR `main → production`) für expliziten Production-Push. Hotfix-Path: gleiches Pattern — Fix in `main`, dann promote.)
  - **Pre-Step (einmalig):** Neuen Branch erstellen: `git checkout main && git checkout -b production && git push -u origin production`. Branch-Protection in GitHub-Settings: nur `main → production`-Merges, keine direkten Pushes, kein force-push.
  - **Build Pack:** Dockerfile (existiert unter `Dockerfile`).
  - **Port:** 3000 (kommt aus `Dockerfile` `EXPOSE 3000`).

- [ ] **2.2 — Temporäre Test-Domain konfigurieren**
  Damit man die App erst unter einer Coolify-eigenen Subdomain hochfährt, ohne `kickpact.com` zu blockieren:
  - *Settings → Domains*: `kickpact-prod-temp.coolify-tmp.schartl.dev` (oder analog — was Coolify als Default-Subdomain bietet) zuerst.
  - Auto-SSL aktivieren.

- [ ] **2.3 — Healthcheck konfigurieren**
  - *Settings → Healthcheck*: Endpoint `/` (Landing-Page rendert ohne Auth, 200 OK). **Nicht** `/status` — `app/status/page.tsx` ist eine Marketing-Statuspage, kein technischer Healthcheck.
  - Interval: 30 s, Timeout: 10 s, Retries: 3, Start-Period: 60 s (Next.js + Drizzle-Connection brauchen ~20 s zum kalt-start).
  - Optional Follow-up-Task (nicht blocking für Launch): dedicated `/api/health`-Route, die DB-Ping + R2-Ping zurückgibt — separater Plan.

- [ ] **2.4 — Build-Resources**
  - Memory limit: ≥ 2 GB (Playwright + Next-Build kombiniert peakt um 1.6 GB).
  - CPU: 2 vCPU minimum für sinnvolle Build-Zeit (~6 min).

- [ ] **2.5 — Volumes**
  Keine persistenten Volumes nötig — R2 ist live, der `/tmp/kickpact-pdfs`-Fallback aus den Frühphase-Plänen ist abgelöst (`STATE.md` Z. 20).

---

## Sektion 3 — Production-ENV (Coolify Secrets)

Alle Werte unter Coolify *Application → Environment Variables*, als **Build-time + Runtime** gesetzt (Coolify-Toggle). Werte aus `.env.example` als Schema, hier Production-Übersicht. **Nie** aus Staging blind kopieren — Secrets, die `BETTER_AUTH_SECRET` etc. heißen, frisch generieren.

### 3.1 — Mapping-Tabelle

| Variable | Production-Wert / Source | Anmerkung |
|---|---|---|
| `DATABASE_URL` | `postgresql://…@…neon.tech/kickpact?sslmode=require` aus dem **neuen** Neon-Branch `production` (Sektion 4) | NIE Staging-DB. |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` frisch generieren | Wenn dieser Secret leakt: Alle Sessions invalidieren. Niemals aus Staging übernehmen. |
| `BETTER_AUTH_URL` | `https://kickpact.com` | OAuth-Redirects gegen diese URL. |
| `NEXT_PUBLIC_BASE_URL` | `https://kickpact.com` | Mail-Templates, Plausible. Build-time **und** Runtime. |
| `GOOGLE_CLIENT_ID` | Bestehend, aber **Authorized Origin + Redirect URI ergänzen** (Sektion 6) | Neuer Client wäre überflüssig — gleicher Project ist ok. |
| `GOOGLE_CLIENT_SECRET` | wie oben | wie oben |
| `APPLE_CLIENT_ID` | Bestehende Services-ID, **Web-Auth-URL ergänzen** (Sektion 6) | |
| `APPLE_CLIENT_SECRET` | Neues JWT signieren mit `scripts/generate-apple-jwt.mjs` nachdem Services-ID Production-URL kennt | Bestehendes JWT funktioniert weiter, aber sauberer: frisch. |
| `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` | unverändert | Nur für Re-Signing-Script. |
| `RESEND_API_KEY` | Frischen Production-Key in Resend-Dashboard erstellen (separater Key statt Staging-Key teilen) | Erlaubt eigene Rate-Limit-Beobachtung. |
| `MAIL_FROM` | `KickPact <hello@kickpact.com>` | DNS aus Sektion 1.3 muss vorher in Resend „verified" sein. |
| `INNGEST_SIGNING_KEY` | Frischen Production-Project-Key im Inngest-Dashboard | **Ohne diesen Wert refused `/api/inngest` in Production** — `app/api/inngest/route.ts` Z. 23-27 ist fail-closed. |
| `INNGEST_EVENT_KEY` | Production-Project Event-Key | Für direct `inngest.send()`-Calls; bei Self-Hosted Inngest optional. |
| `STRIPE_SECRET_KEY` | `sk_test_…` (**Test-Mode bleibt für Launch** — User-Entscheidung 2026-05-25; Live-Aktivierung erst nach Pilot-Validierung als separater Schritt) | Echte Charges noch nicht möglich, aber kompletter Stripe-Flow testbar mit Test-Cards. |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` aus separatem Production-Test-Webhook (Sektion 5.4) | Separater Endpoint im Stripe-Test-Dashboard. |
| `STRIPE_BASIC_MONTHLY_PRICE_ID` | `price_…` aus Test-Mode-Prices (Sektion 5.3) | Test-IDs können von Staging übernommen werden. |
| `STRIPE_BASIC_SEASON_PRICE_ID` | dito | |
| `STRIPE_BASIC_ANNUAL_PRICE_ID` | dito | |
| `STRIPE_PRO_MONTHLY_PRICE_ID` | dito | |
| `STRIPE_PRO_SEASON_PRICE_ID` | dito | |
| `STRIPE_PRO_ANNUAL_PRICE_ID` | dito | |
| `STRIPE_VEREIN_MONTHLY_PRICE_ID` | dito | |
| `STRIPE_VEREIN_SEASON_PRICE_ID` | dito | |
| `STRIPE_VEREIN_ANNUAL_PRICE_ID` | dito | |
| `R2_ACCOUNT_ID` | Unverändert übernehmen | Account bleibt gleich. |
| `R2_BUCKET` | **`kickpact-prod`** (User-Entscheidung 2026-05-25 — **separat von Staging-Bucket**) | Neuer Bucket anlegen via Cloudflare-Dashboard → R2 → Create bucket. CORS analog konfigurieren falls Browser direkt Signed-URLs lädt. Sauberer Cut zwischen Test-Uploads und echten Verifications-PDFs. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Neue API-Token mit Scope nur auf `kickpact-prod` erstellen | Cloudflare-Dashboard → R2 → Manage R2 API Tokens. Bestehende Staging-Token bleiben unangetastet. |
| `KICKPACT_ADMIN_EMAILS` | `johannes@kickpact.com` (comma-separated für mehr Ops-Leute) | Schaltet `/admin/*`-Routes frei — Phase E2 ENV-Gate. |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | `kickpact.com` | Build-time variable, **muss vor Build gesetzt sein** (Next.js inlinet `NEXT_PUBLIC_*` zur Build-Zeit). |
| `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC` | leer lassen (default `plausible.io/js/script.js`) | |
| `PLAUSIBLE_API_KEY` | unbenutzt — nur setzen falls zukünftige Server-Side-Event-Funktion gebraucht wird | |
| `NODE_ENV` | `production` (Dockerfile setzt bereits, Coolify-Override nicht nötig) | |

### 3.2 — Secret-Hygiene-Checks

- [ ] Kein Secret aus `STATE.md` Z. 44–52 ist im Git-Tree (Sanity: `git grep -E "sk_live_|whsec_|BETTER_AUTH_SECRET"` muss leer sein).
- [ ] Coolify zeigt alle Secrets als „masked" — keine plaintext-Exposure in Logs.
- [ ] `.env.local` lokal NICHT mit Production-Werten füllen — Production lebt nur in Coolify.

---

## Sektion 4 — Production-DB-Branch (Neon)

**Quelle:** [Neon Branching docs](https://neon.tech/docs/introduction/branching).

- [ ] **4.1 — Branch-Strategie entscheiden**
  - **Option A (empfohlen, default):** Neuer leerer Branch `production`. Migrations laufen frisch, **keine** Pilot-Daten aus Staging übernommen. Beta-Vereine bleiben auf Staging bis sie selbst auf Production wechseln (Re-Onboarding) — sauberer Cut.
  - **Option B:** Staging-Daten 1:1 in Production via `pg_dump`/`restore`. Schneller, aber bringt Test-Müll mit. Falls Pilot-Vereine aus Staging bereits committed sind (Heidelberg-Vereine): Whitelist exportieren und manuell re-seed.
  - **Default = A**, mit dem `scripts/onboard-real-club.ts`-Skript können einzelne Vereine bei Bedarf re-onboarded werden.

- [ ] **4.2 — Branch erstellen (Option A)**
  Neon-Console → Project → *Branches → New branch*:
  - **Name:** `production`
  - **Parent:** `main` (oder welcher branch dein Schema-Baseline ist) → *Restore from*: keine Daten (leer), Schema wird per Drizzle-Migration aufgebaut.
  - Kopiere die Connection-String aus *Connection details → Pooled connection* (Pooled wegen Serverless-Cold-Start; Direct nur für Migrations).

- [ ] **4.3 — Migrations auf Production-Branch fahren**
  Lokal mit Production-DATABASE_URL in einer **temporären** `.env.production.migrate`-Datei (NICHT committen):
  ```bash
  DATABASE_URL="<production-direct-url>" npm run db:migrate
  ```
  Erwartung: alle 16+ Migrations laufen ohne Fehler, kein Schema-Drift.

- [ ] **4.4 — Verify-Query**
  ```bash
  DATABASE_URL="<production-direct-url>" npx tsx -e "import { db } from './lib/db/client'; import { sql } from 'drizzle-orm'; (async () => { const r = await db.execute(sql\`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename\`); console.log(r.rows.length, 'tables'); process.exit(0); })()"
  ```
  Erwartung: ≥ 25 Tabellen (clubs, users, pledges, invoices, match_events, club_verifications, sent_notifications, … — Anzahl je nach Schema-Stand).

- [ ] **4.5 — Snapshot vor Go-Live**
  Neon-Console → *Branches → production → Create snapshot* → Name: `pre-launch-2026-05-25`. Snapshot ist Rollback-Anker (Sektion 11).

---

## Sektion 5 — Stripe-Setup (Test-Mode für Launch, Live-Activation als Follow-up)

> **User-Entscheidung 2026-05-25:** Production startet mit **Stripe-Test-Mode**. Echte Charges sind disabled — Pilot-Vereine durchlaufen den kompletten Stripe-Flow mit Test-Cards (4242…). Live-Aktivierung ist ein **separater, späterer Schritt** nach Pilot-Validierung. Steps 5.1 + 5.2 sind hier dokumentiert für später, **werden aber für den Launch nicht gemacht**.

**Quelle:** [docs/operations/stripe-setup.md](../../operations/stripe-setup.md).

### Was du JETZT machst (Launch-Pfad)

- [ ] **5.0a — Test-Mode-Webhook für Production-Domain einrichten**
  *Stripe-Dashboard → Test-Mode → Developers → Webhooks → + Add endpoint*:
  - **Endpoint URL:** `https://kickpact.com/api/stripe/webhook`
  - **Events** wie unter 5.4 (5 Events).
  - **Signing-Secret kopieren** → Coolify als `STRIPE_WEBHOOK_SECRET`.

- [ ] **5.0b — Test-Mode-Price-IDs in Production-ENV übernehmen**
  Die 9 Test-Price-IDs aus dem Staging-Coolify-ENV (gleiche Stripe-Account, gleiche Test-Mode-Prices) 1:1 in `kickpact-production`-App-ENV übertragen (alle 9 `STRIPE_*_PRICE_ID`).

- [ ] **5.0c — Test-Mode-Secret-Key in Production**
  `STRIPE_SECRET_KEY` = `sk_test_…` (gleicher Key wie Staging, oder frisch generierter Test-Key — egal, Test-Mode hat keine Reputation).

- [ ] **5.0d — Test-Charges-Smoke**
  Eigene Test-Card `4242 4242 4242 4242` → Basic-Monthly-Checkout. Webhook-Log: `200 OK` von KickPact für `customer.subscription.created`. Keine echte Belastung.

### Was du SPÄTER machst (Live-Activation, separater Step)

- [ ] **5.1 — Stripe-Account-Aktivierung (FRÜH ANSTOSSEN, kann 1–3 Tage dauern)**
  - Stripe-Dashboard → *Settings → Account → Activate account*.
  - Steuer-ID (USt-ID DE…), Geschäftsadresse, Bankverbindung (IBAN für Auszahlungen), Identitätsverifizierung (Personalausweis-Scan), Vertretungsberechtigung-Nachweis.
  - **Achtung:** Auszahlungen sind blockiert bis Verifizierung durch ist. Live-Mode kann man trotzdem schon nutzen, nur Payouts hängen.

- [ ] **5.2 — Tax-Settings (EU)**
  - *Settings → Tax → Automatic Tax* aktivieren.
  - Origin-Address eintragen (Geschäftsadresse).
  - VAT-Schwelle für DE auf €0 (Reverse-Charge / inländische MwSt automatisch).
  - **Tax-Behavior auf Price-Ebene:** „inclusive" für alle 9 Prices (Brutto-Preise — `docs/operations/stripe-setup.md` Z. 53).

- [ ] **5.3 — 9 Produkte + Prices in Live-Mode neu anlegen**
  Live-Toggle umschalten (Dashboard rechts oben). Produkte + Prices identisch zu `docs/operations/stripe-setup.md` Sektion 3:

  | Produkt | Price-Variante | EUR | Recurring | Env-Var |
  |---|---|---|---|---|
  | KickPact Basic | Monthly | 5,00 | `month` × 1 | `STRIPE_BASIC_MONTHLY_PRICE_ID` |
  | KickPact Basic | Season-Pass | 39,00 | `month` × 10 | `STRIPE_BASIC_SEASON_PRICE_ID` |
  | KickPact Basic | Annual | 49,00 | `year` × 1 | `STRIPE_BASIC_ANNUAL_PRICE_ID` |
  | KickPact Pro | Monthly | 19,00 | `month` × 1 | `STRIPE_PRO_MONTHLY_PRICE_ID` |
  | KickPact Pro | Season-Pass | 149,00 | `month` × 10 | `STRIPE_PRO_SEASON_PRICE_ID` |
  | KickPact Pro | Annual | 189,00 | `year` × 1 | `STRIPE_PRO_ANNUAL_PRICE_ID` |
  | KickPact Vereinslizenz | Monthly | 49,00 | `month` × 1 | `STRIPE_VEREIN_MONTHLY_PRICE_ID` |
  | KickPact Vereinslizenz | Season-Pass | 389,00 | `month` × 10 | `STRIPE_VEREIN_SEASON_PRICE_ID` |
  | KickPact Vereinslizenz | Annual | 489,00 | `year` × 1 | `STRIPE_VEREIN_ANNUAL_PRICE_ID` |

  Beim Anlegen jeder Price-ID: sofort kopieren in Coolify-ENV (Sektion 3.1).

- [ ] **5.4 — Webhook-Endpoint anlegen**
  *Developers → Webhooks → + Add endpoint*.
  - **Endpoint URL:** `https://kickpact.com/api/stripe/webhook` (in Sektion 8 nach Domain-Switch — vorab kann mit temporärer Coolify-Subdomain getestet werden).
  - **Events to send** (aus Code-Analyse `app/api/stripe/webhook/route.ts`):
    - `customer.subscription.created`
    - `customer.subscription.updated`
    - `customer.subscription.deleted`
    - `invoice.paid`
    - `invoice.payment_failed`

    Falls Code-Erweiterungen passieren (z.B. `checkout.session.completed`), Liste aktualisieren — Source-of-Truth ist immer `app/api/stripe/webhook/route.ts` `switch (event.type)`.
  - Nach „Add endpoint": **Signing secret** → „Reveal" → in Coolify als `STRIPE_WEBHOOK_SECRET`.

- [ ] **5.5 — Customer-Portal konfigurieren**
  *Settings → Billing → Customer Portal → Activate*.
  - **Allow customers to cancel subscriptions:** ✅
  - **Cancellation behaviour:** „at period end" (kein Sofort-Cancel — bezahltes Saison-Pass nicht verschwenden).
  - **Allow customers to update payment method:** ✅
  - **Allow customers to update billing/shipping info:** ✅ (für korrekte Rechnungen).
  - **Allow plan switching:** ✅ (Basic → Pro etc.) — aktiviere die 9 Live-Prices als „products customers can switch to".
  - **Business information:** Logo, Geschäftsname „KickPact", Support-Email `support@kickpact.com`.

- [ ] **5.6 — Statement Descriptor**
  *Settings → Public details → Statement descriptor*: `KICKPACT` (max 22 chars, beeinflusst was auf Kontoauszug erscheint).

- [ ] **5.7 — Sanity-Test im Live-Mode**
  Eigene Karte → Basic-Monthly-Checkout (5€) durchspielen, im Dashboard sofort Refund auslösen. Webhook-Log in Stripe-UI: `200 OK` von KickPact für `customer.subscription.created` + `invoice.paid`.

---

## Sektion 6 — OAuth-Provider Updates

### 6.1 — Google Cloud Console

**Quelle:** [Google Identity OAuth setup](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred).

- [ ] *APIs & Services → Credentials → OAuth 2.0 Client IDs* → bestehenden Client öffnen.
- [ ] **Authorized JavaScript origins** — ergänzen (nicht ersetzen, Staging-URLs bleiben):
  - `https://kickpact.com`
  - `https://www.kickpact.com`
- [ ] **Authorized redirect URIs** — ergänzen:
  - `https://kickpact.com/api/auth/callback/google`
  - `https://www.kickpact.com/api/auth/callback/google` (für den Fall, dass User www tippt)
- [ ] Save → ~5 min warten bis Google den Cache invalidiert.

### 6.2 — Apple Developer

**Quelle:** [Sign in with Apple — Configure your environment](https://developer.apple.com/documentation/sign_in_with_apple/configuring_your_environment_for_sign_in_with_apple).

- [ ] *Certificates, IDs & Profiles → Identifiers → Services IDs* → bestehende Services-ID (z.B. `com.kickpact.web.auth`) öffnen.
- [ ] **Sign in with Apple → Configure**:
  - **Primary App ID:** unverändert.
  - **Domains and Subdomains:** ergänzen `kickpact.com` und `www.kickpact.com`.
  - **Return URLs:** ergänzen `https://kickpact.com/api/auth/callback/apple` und `https://www.kickpact.com/api/auth/callback/apple`.
- [ ] Save.
- [ ] **Apple JWT neu signieren** — die Domain-Liste ist Teil des Service-ID-Profils, das JWT selber nutzt nur Team-ID + Key-ID + Services-ID als Client-ID. Aber: Best practice nach Domain-Änderung ein frisches JWT generieren:
  ```bash
  node scripts/generate-apple-jwt.mjs
  ```
  Output (~1500 Zeichen) → in Coolify als `APPLE_CLIENT_SECRET`.
- [ ] Notieren: nächste JWT-Rotation in 5 Monaten (Reminder im Kalender — `STATE.md` Z. 89).

---

## Sektion 7 — Plausible Production

**Quelle:** [Plausible — Add a website](https://plausible.io/docs/add-website).

- [ ] **7.1 — Site anlegen**
  Plausible-Dashboard → *+ Add a website*:
  - **Domain:** `kickpact.com`
  - **Timezone:** Europe/Berlin
- [ ] **7.2 — ENV setzen**
  `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=kickpact.com` in Coolify (Sektion 3.1). Build-time-Var → Coolify muss **rebuild + redeploy** auslösen, nicht nur restart.
- [ ] **7.3 — Custom-Events bleiben unverändert**
  Die 15 instrumentierten Events (`STATE.md` Z. 50) sind code-side, müssen nicht extra in Plausible registriert werden — Plausible nimmt beliebige Event-Names entgegen. Optional: *Goals* für die wichtigsten Events anlegen (`signup`, `pledge_created`, `checkout_completed`) damit Conversion-Funnel sichtbar wird.
- [ ] **7.4 — DNS-Hint (optional)**
  Falls Werbeblocker-Bypass via eigenem Subdomain-Proxy gewünscht: `analytics.kickpact.com` CNAME auf `proxy.plausible.io`, dann `NEXT_PUBLIC_PLAUSIBLE_SCRIPT_SRC=https://analytics.kickpact.com/js/script.js`. **Nicht** Launch-blocking, kann später nachgezogen werden.

---

## Sektion 8 — Production-Deploy-Reihenfolge

Reihenfolge ist kritisch, damit man nicht 10 Minuten lang eine kaputte Domain hat.

- [ ] **8.1 — DNS-Records anlegen** (Sektion 1, falls noch nicht passiert). TTL 300s. Verifizieren mit `dig`.
- [ ] **8.2 — Coolify-App unter Test-Subdomain hochfahren** (Sektion 2.2). Erster Deploy in Coolify triggern, Build-Log live mitlesen (~6 min).
- [ ] **8.3 — Smoke unter Test-Subdomain**
  - `curl -I https://<test-subdomain>/` → 200, Content-Type `text/html`.
  - Browser: Landing-Page rendert, Plausible-Script wird geladen (Network-Tab).
  - `/login` → Magic-Link funktioniert (Resend-Sandbox-Limit → nur Account-Email; ok für Smoke).
  - Drizzle-Studio öffnen mit Production-DATABASE_URL, prüfen ob beim Login eine `users`-Row entstanden ist.
- [ ] **8.4 — ENV auf Production-Werte umschalten** (Sektion 3.1 komplett füllen, alle 30+ Variablen). Re-deploy triggern.
- [ ] **8.5 — Erweitertes Smoke unter Test-Subdomain (Production-Keys aktiv)**
  - [ ] Magic-Link an eigene Email (verifizierte Resend-Domain).
  - [ ] Google-Login → Redirect klappt zurück auf Test-Subdomain (Google-Konsole hat sie unter „Authorized origins"? Falls nicht: temporär dazu, später entfernen).
  - [ ] Apple-Login analog.
  - [ ] Vereins-Onboarding-Start: Vereinssuche, Mannschaftswahl, Plan-Auswahl.
  - [ ] Stripe-Checkout: Basic-Monthly mit echter Karte (5€), Refund nach Webhook-Empfang.
  - [ ] PDF-Generierung: Manual-Match-Event → Approve → Monats-Trigger → PDF auf R2.
  - [ ] Crawler-Ping: Inngest-Dashboard → `crawl-matches`-Function einmal manuell triggern, sehen ob fußball.de-Request rausgeht.
  - [ ] Admin-Login: mit `johannes@kickpact.com` einloggen, `/admin/verifications` öffnet ohne 404.
- [ ] **8.6 — Domain umschalten**
  Coolify → App → *Settings → Domains*: `kickpact-prod-temp.coolify-tmp.schartl.dev` entfernen, `kickpact.com` + `www.kickpact.com` hinzufügen. Auto-SSL anschalten → Let's-Encrypt-Challenge läuft (~30 s — DNS aus 1.2 muss aufgelöst werden).
- [ ] **8.7 — SSL-Cert verifizieren**
  ```bash
  curl -I https://kickpact.com/
  echo | openssl s_client -servername kickpact.com -connect kickpact.com:443 2>/dev/null | openssl x509 -noout -dates
  ```
  Erwartung: 200, gültiges LE-Cert (issuer `R10` o.ä., notAfter ~90 Tage in Zukunft).
- [ ] **8.8 — `BETTER_AUTH_URL` + `NEXT_PUBLIC_BASE_URL` final auf `https://kickpact.com` setzen** (falls in 8.4 noch auf Test-Subdomain). **Rebuild + Redeploy.** Build-Time-Vars werden sonst nicht inlined.
- [ ] **8.9 — Final-Smoke unter `https://kickpact.com`**
  Smoke aus 8.5 wiederholen unter der echten Domain, mit besonderem Fokus auf:
  - OAuth-Redirects landen auf `kickpact.com` (nicht Test-Subdomain).
  - Stripe-Webhook-Endpoint in Stripe-Dashboard auf `https://kickpact.com/api/stripe/webhook` umgestellt, „Send test webhook" → 200.
  - Mails kommen mit `From: KickPact <hello@kickpact.com>`.
  - Plausible registriert Pageview (Realtime-Tab im Plausible-Dashboard).
- [ ] **8.10 — Inngest-Sync**
  Inngest-Dashboard → Production-Project → *Apps → Add App*: URL `https://kickpact.com/api/inngest`, Inngest pingt automatisch → alle Functions tauchen auf, Crons werden registriert. Verifizieren in *Functions*-Tab: `crawl-matches`, `generate-invoices`, `trial-reminders`, `approval-reminders`, `cleanup-sessions`, `anonymize-accounts`, … sichtbar.

---

## Sektion 9 — Pre-Launch-Checkliste

Master-Liste, die vor 8.6 (Domain-Switch) abgehakt sein MUSS:

- [ ] **Stripe Test-Mode-Webhook auf Prod-URL registriert + Signing-Secret in Coolify (5.0a).**
- [ ] **9 Test-Mode-Price-IDs in Coolify-ENV (5.0b + 3.1).**
- [ ] **Test-Charges-Smoke mit Test-Card `4242…` durchgespielt (5.0d).**
- [ ] ~~Stripe-Account-Aktivierung durch~~ — **Follow-up**, nicht launch-blocking (Test-Mode bleibt).
- [ ] ~~9 Live-Mode-Prices angelegt~~ — **Follow-up**.
- [ ] ~~Live-Mode-Test-Checkout durchgespielt + Refund~~ — **Follow-up**.
- [ ] Google OAuth-Origins + Redirects um `kickpact.com` ergänzt (6.1).
- [ ] Apple Services-ID-Domains aktualisiert + JWT re-signiert + in Coolify (6.2).
- [ ] Resend-Domain `mail.kickpact.com` als „Verified" in Resend-Dashboard (SPF + DKIM + DMARC grün — 1.3).
- [ ] `MAIL_FROM=KickPact <hello@kickpact.com>` testet aus Resend-Sandbox raus (kein Sandbox-Limit mehr).
- [ ] Neon-Production-Branch erstellt + migriert (Sektion 4).
- [ ] Neon-Snapshot `pre-launch-2026-05-25` existiert (4.5).
- [ ] R2-Bucket-CORS: falls Production-Domain direkte Signed-URL-Downloads aus dem Browser macht (PDF-Sponsor-Mail-Klick → R2-URL), CORS-Origin muss `https://kickpact.com` enthalten. Aktueller Stand prüfen:
  - Cloudflare-Dashboard → R2 → Bucket → *Settings → CORS Policy*.
  - Falls noch leer/auf Staging: erweitern um `https://kickpact.com`, `https://www.kickpact.com`.
- [ ] Plausible-Site `kickpact.com` angelegt (7.1).
- [ ] Coolify-Backups aktiviert: Coolify hat eingebaute Postgres-Backup-Funktion, aber wir nutzen Neon — Neon hat Auto-Backups (7-Tage-PITR). Verify: Neon-Console → Project → *Settings → Backups* zeigt PITR-Window. R2 hat keine native Backup-Funktion; relevant ist eigentlich nur die DB.
- [ ] Inngest-Production-Project existiert + Signing-Key in Coolify (3.1) + Production-Project-Sync (8.10).
- [ ] `KICKPACT_ADMIN_EMAILS=johannes@kickpact.com` gesetzt (3.1), `/admin/verifications` öffnet als Johannes.
- [ ] **Status-Page** (`status.kickpact.de`/`.com` in `beta-onboarding.md` referenziert): aktuell UptimeRobot. Vor Launch: UptimeRobot-Monitor auf `https://kickpact.com/` einrichten, Status-Page-URL setzen. Nicht launch-blocking, aber „nice to have within 1h after launch".
- [ ] **Sentry / Error-Tracking**: Aktuell **nicht** im Stack (kein `@sentry/*` in package.json). Erwähnt als „nice to have" — `STATE.md` listet kein Sentry. Empfehlung als eigener Plan: Sentry-Browser + Sentry-Node-Sdk + Source-Maps-Upload. Für Plan 6 nicht blocking, aber zeitnah ergänzen sobald Live-User Traffic generieren.

---

## Sektion 10 — Post-Launch-Monitoring (erste 72 h)

- [ ] **10.1 — Inngest-Dashboard**
  Tab *Functions → Runs*. Filter `failed`. Bei jedem Failed-Run: Stack-Trace lesen, falls echter Bug → Hotfix-Commit auf `main`, Coolify auto-deployed. Wenn nur Rate-Limit (z.B. fußball.de): in `crawl-matches` Concurrency-Limit hochsetzen → eigener PR.
- [ ] **10.2 — Coolify-Logs**
  Coolify-UI → App → *Logs* live mit-streamen erste 30 min nach Launch. `error`/`ENOENT`/`Cannot find module` sind sofortige Hotfix-Trigger.
- [ ] **10.3 — Plausible**
  Realtime-Tab beobachten — erster Pageview = SSL-Cert klappt, Script lädt. Funnel: `pageview /` → `pageview /onboarding/verein/1` → `pledge_created` → `checkout_completed` (mit den 15 instrumentierten Events). Drop-Offs lokalisieren.
- [ ] **10.4 — Resend-Dashboard**
  *Emails*-Tab: Bounce-Rate ≤ 5 %, Spam-Rate ≤ 0.1 %. Wenn höher → SPF/DKIM in Sektion 1.3 erneut verifizieren, oder MAIL_FROM-Domain bei Senderbase-Tools (e.g. <https://mail-tester.com>) testen.
- [ ] **10.5 — Stripe-Dashboard**
  *Payments → Recent*: erste Live-Subscription-Charge erscheint. *Developers → Webhooks → Endpoint*: alle Events `2xx`. Wenn 4xx/5xx kommen → Coolify-Logs für `[stripe-webhook]`-Errors filtern.
- [ ] **10.6 — Neon-Console**
  *Monitoring → Connections + Queries*: Connection-Pool auslastet? (Pooled-URL aus 4.2 sollte Cold-Start-Spikes abfangen.) Query-P95 < 200 ms.

---

## Sektion 11 — Rollback-Plan

Drei Szenarien, mit Eskalations-Reihenfolge.

### 11.1 — Kleiner Bug, Hotfix auf `main` möglich
1. Fix lokal → PR → Merge → Coolify auto-deployed in ~6 min.
2. Während Re-Deploy: KEIN Rollback der Domain nötig, Coolify hält alte Version bis Health-Check der neuen grün ist.

### 11.2 — Großer Bug, Code muss zurück
1. **Git-Revert** des letzten Commits, push auf `main` → Auto-Deploy. Letzten bekannten guten Commit als „Rollback-Target" notieren: `git log -1 --format=%H main` vor jedem Launch.
2. Falls Revert kompliziert (Merge-Konflikte): Coolify → App → *Deployments* → letzten grünen Deploy auswählen → *Redeploy this deployment*. Schaltet sofort zurück, kein Build nötig.

### 11.3 — Infrastruktur kaputt (DB-Migration zerstört Daten, R2-Bucket gelöscht, Coolify down)
1. **DNS zurück auf Staging:** Cloudflare-Dashboard → `kickpact.com` A-Record auf Staging-IP (oder CNAME auf `kickpact.schartl.dev`). TTL 300 s → ≤ 5 min Propagation.
2. **DB-Restore aus Snapshot:** Neon-Console → *Branches → production → Restore from snapshot* → `pre-launch-2026-05-25` (4.5).
3. Post-Mortem: warum hat Smoke-Test in Sektion 8 das nicht gefangen? → Smoke erweitern.

### 11.4 — Rollback-Buchführung
- Bei jedem Production-Deploy: Commit-SHA in `STATE.md` aktualisieren (siehe „Letzter Commit"-Feld).
- Bei Rollback: dedizierten Eintrag in `STATE.md` „Audit-Trail" — Datum + SHA-vor + SHA-nach + Ursache.

---

## Risiko-Sektion

Wo es schiefgehen kann, ranked nach Wahrscheinlichkeit × Schaden:

| Risiko | Wahrscheinlichkeit | Schaden | Mitigation |
|---|---|---|---|
| ~~Stripe-Account-Aktivierung dauert > 3 Tage~~ | – | – | **Nicht relevant für Launch** — User-Entscheidung: Test-Mode für Pilot. Live-Aktivierung als separater Schritt nach Pilot-Validierung. |
| Wrong push: jemand pusht direkt auf `production`-Branch | Mittel | Hoch | GitHub Branch-Protection auf `production`: nur Merges aus `main`, keine direkten Commits, kein force-push. Pre-Reqs explizit. |
| Test-Mode-Charges werden für „echt" gehalten | Mittel | Niedrig | Im Verein-Dashboard + auf der Stripe-Checkout-Seite zeigt Stripe `TEST MODE` Banner. Plus: Banner im KickPact-UI „Testbetrieb — keine echten Abbuchungen" (Follow-up-Task). |
| Apple-OAuth bricht in Production weil JWT nicht für `kickpact.com` ausgestellt | Mittel | Mittel | 6.2 explizit: JWT nach Domain-Update neu signieren. Smoke 8.5/8.9 hat Apple-Login als Pflicht-Check. |
| Resend-DKIM nicht verifiziert → Mails landen im Spam | Mittel | Hoch | 1.3 + 9.1 — Domain MUSS in Resend „Verified" sein bevor erste Live-Mails rausgehen. <https://mail-tester.com>-Score ≥ 9/10 vor Launch. |
| Neon-Production-Branch nicht migriert, App crasht beim ersten Query | Mittel | Hoch | 4.3 explizit migrieren + 4.4 verifizieren. Smoke 8.3 fängt es. |
| `INNGEST_SIGNING_KEY` nicht gesetzt → `/api/inngest` 500 → keine Crawler-Runs → keine Match-Events → Sponsoren denken App ist tot | Mittel | Sehr Hoch | 3.1 + 9.1. Code ist fail-closed (`app/api/inngest/route.ts` Z. 23-27) genau weil dieses Risiko bekannt ist. |
| R2-CORS blockt PDF-Downloads aus Sponsor-Mail-Link | Mittel | Mittel | Sektion 9 — CORS prüfen + um `kickpact.com` erweitern. Smoke 8.5 PDF-Test hängt sonst. |
| OAuth-Redirect-URI vergessen → User landet im 400 nach Google-Login | Niedrig | Hoch | Sektion 6.1 + 6.2 — beide Konsolen explizit erwähnt, Smoke 8.5/8.9 testet beide Provider. |
| DNS-TTL > 300 s → Rollback dauert Stunden statt Minuten | Niedrig | Mittel | 1.2 erzwingt 300 s TTL. Erst nach 7 Tagen stabilem Launch auf höheres TTL (3600 s) hochsetzen. |
| Coolify-Auto-SSL schlägt fehl weil DNS noch Proxied | Niedrig | Niedrig | 1.2 — DNS-only (graue Wolke) bis SSL grün ist. Erst dann optional Proxied. |
| `NEXT_PUBLIC_*`-Vars werden nicht aktualisiert weil Container nur restartet wird statt rebuild | Mittel | Mittel | 8.4 + 8.8 explizit „Rebuild + Redeploy" — nicht nur „Restart". Coolify-UI klickt das auseinander. |
| Pilot-Daten aus Staging vergessen | Niedrig | Niedrig | Sektion 4.1 Option A explizit erwähnt: re-onboarden via `scripts/onboard-real-club.ts`. |
| Status-Page (`status.kickpact.com`) ist nicht angelegt, Incident kann nicht kommuniziert werden | Mittel | Niedrig | Sektion 9 — UptimeRobot innerhalb 1 h nach Launch. Nicht hard-blocking aber Tracking. |
| `MAIL_FROM` zeigt auf `hello@kickpact.com`, aber Mailbox gibt's nicht → Bounces auf Reply-To-Antworten von Usern | Mittel | Niedrig | Vor Launch: Catch-All-Forwarding `*@kickpact.com → johannes@…` bei Cloudflare Email Routing einrichten. |

---

## Aufwandsschätzung

| Block | Aufwand | Anmerkung |
|---|---|---|
| ~~Stripe-Live-Aktivierung~~ | – | **Aus Launch-Scope rausgenommen** — Test-Mode bleibt. Live-Aktivierung als separater Follow-up nach Pilot-Validierung. |
| Git-Branch `production` erstellen + Branch-Protection auf GitHub | ~15 min | Lokal `git checkout -b production && git push -u origin production`, dann Settings → Branches → Add rule. |
| DNS-Setup + Resend-Domain-Verify | ~1 h | Cloudflare-Records + Resend-Verify ist mechanisch. |
| Coolify-App `kickpact-production` aufsetzen + Test-Subdomain + Branch `production` | ~1 h | Erster Build ~6 min, dazu Konfiguration. |
| R2-Bucket `kickpact-prod` anlegen + API-Token + CORS | ~20 min | Cloudflare-R2-Dashboard. |
| Stripe Test-Mode-Webhook für Prod-Domain + ENV-Übernahme | ~20 min | Webhook im Test-Dashboard anlegen, 9 Test-Price-IDs aus Staging übernehmen. |
| OAuth-Konsolen-Updates (Google + Apple JWT) | ~30 min | |
| Neon-Production-Branch + Migration + Snapshot | ~30 min | |
| Plausible-Site + ENV-Update | ~10 min | |
| ENV in Coolify komplett füllen | ~30 min | 30+ Variablen, sorgfältig. |
| Smoke-Tests (8.3, 8.5, 8.9) | ~1 h | OAuth + Onboarding + Stripe + PDF + Crawler-Ping. |
| Domain-Switch + SSL + Final-Smoke | ~30 min | |
| Post-Launch-Monitoring (erste 24 h) | ~2 h verteilt | |
| **Aktive Arbeit gesamt** | **~7–8 h** | über 1–2 Tage verteilt, plus 1–3 Tage Stripe-Wartezeit am Anfang. |

**Empfehlung:** Stripe-Aktivierung sofort starten (Block 1), während der 1–3 Tage Wartezeit alle anderen Blöcke vorbereiten (DNS, Coolify, Neon, Plausible, OAuth-Updates). Sobald Stripe-Live freigeschaltet ist: ein konzentrierter Tag für 5.3 + 5.4 + 5.5 + 8.x + Smoke + Domain-Switch.

---

## Querverweise

- [STATE.md](../../../STATE.md) — aktueller Stand & verfügbare Secrets in Coolify.
- [docs/operations/stripe-setup.md](../../operations/stripe-setup.md) — Stripe-Setup im Detail.
- [docs/operations/beta-onboarding.md](../../operations/beta-onboarding.md) — Pilot-Playbook (Status-Page referenziert).
- [docs/superpowers/specs/2026-05-25-trust-and-payment-model-design.md](../specs/2026-05-25-trust-and-payment-model-design.md) — non-custodial Modell, erklärt warum Stripe **nur** für Lizenz-Billing genutzt wird, nicht für Sponsor-Geld.
- [.env.example](../../../.env.example) — alle ENV-Vars als Referenz.
- [Dockerfile](../../../Dockerfile) — Container-Setup (Playwright-Base, Port 3000, Help-Center-Pfad-Copy).
