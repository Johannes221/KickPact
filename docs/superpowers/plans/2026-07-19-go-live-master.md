# Go-Live-Master — Web + iOS (Stand 2026-07-19)

> Verifizierter Ist-Stand, nicht aus STATE.md (das ist von 06-12 und veraltet).
> Quellen: Repo-Checks von heute + Memories `prod_never_deployed`,
> `launch_audit_2026_07_16`, `ios_testflight_pipeline`.

## Kernaussage

**Es gibt keinen Code-Blocker mehr.** Der Web-Launch hängt zu 100 % an externer
Konfiguration (DNS, Secrets, Coolify-Webhook, Stripe-Live). Der iOS-Launch hängt
zusätzlich an drei Native-Build-Punkten, die im Repo **verifiziert offen** sind.

**Web und iOS sind entkoppelt.** Web kann live gehen, ohne dass Apple irgendetwas
freigegeben hat. iOS kann erst *nach* Web live, weil die App eine Remote-WebView
auf `kickpact.com` ist — ohne laufende Prod-Domain zeigt jeder Store-Build ins Leere.

---

## Ist-Stand (heute im Repo geprüft)

| Thema | Stand | Beleg |
|---|---|---|
| `production`-Branch | **36 Commits hinter `main`** | `git rev-list --left-right --count` |
| Prod-Container | **existiert nicht**, einziger Deploy-Versuch (839edcf) failed am Env-Validator | Memory `prod_never_deployed` |
| Coolify-Webhook für `kickpact-prod` | **fehlt** — `promote:prod` ist folgenlos, Exit 0 ohne Wirkung | dito |
| `kickpact.com` DNS | **kein A-Record** (apex + www leer) | dito |
| Prod-Secrets | **~51 leer**, 8 davon Boot-Pflicht | `instrumentation.ts:24` |
| Prod-DB | ✅ steht (self-hosted PG16 auf Hetzner, Backups laufen) | Memory Launch-Audit |
| Legal-Seiten | ✅ `app/(legal)/{impressum,datenschutz,agb}` | Repo |
| Apple-IAP-Code | ✅ in `main` gemerged, Plugin registriert, Bridge-Fix drin | `app/api/apple/*`, `IAPPlugin.swift` |
| TestFlight-Pipeline | ✅ funktioniert per CLI, Build 6 im pbxproj | Memory `ios_testflight_pipeline` |
| `PrivacyInfo.xcprivacy` | ⚠️ **Datei da, aber 0 Referenzen im pbxproj** → wird nicht gebündelt | `grep -c` = 0 |
| `aps-environment` | ⚠️ **`development`** → Prod-Push wäre komplett tot | `App.entitlements` |
| `@capacitor/keyboard` | ⚠️ **nicht installiert** → Tastatur verdeckt Eingabefelder | `package.json` |

---

## Track A — Web-Launch (kritischer Pfad)

Reihenfolge ist zwingend: jeder Schritt scheitert ohne den vorigen.

### A1. Prod-Env vollständig befüllen (Johannes)
Der Boot bricht hart ab, solange eines dieser 8 fehlt — das ist Absicht:
`DATABASE_URL` · `BETTER_AUTH_SECRET` · `BETTER_AUTH_URL` · `NEXT_PUBLIC_BASE_URL` ·
`NEXT_PUBLIC_SITE_ENV` · `RESEND_API_KEY` · `MAIL_FROM` · `INNGEST_SIGNING_KEY`

Zwei Fallen:
- `BETTER_AUTH_URL` **muss zeichengleich** `NEXT_PUBLIC_BASE_URL` sein, sonst wirft der Validator (`instrumentation.ts:46`).
- `NEXT_PUBLIC_SITE_ENV=production` muss **Build-Env** sein, nicht Runtime — sonst backt Next.js den Staging-Wert ins Bundle.

Zusätzlich still-degradierend (kein Boot-Abbruch, aber Datenverlust/Blindflug):
`SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `REDIS_URL`, `CLOUDFLARE_R2_*`.
**R2 nicht weglassen** — ohne R2 liegen PDFs auf ephemerem Container-Speicher und sind beim nächsten Deploy weg.

Ich fasse fremde API-Keys grundsätzlich nicht an. Was ich übernehmen kann, sobald du mir Zugang gibst: DNS-Records, Coolify-Webhook, Deploy-Trigger, Verifikation.

### A2. Stripe Live scharf schalten (Johannes)
Live-Account aktiv → 6 Price-IDs im Live-Mode (Basic/Pro/Verein × monthly/season) →
Live-Webhook-Endpoint auf `https://kickpact.com/api/stripe/webhook` → neues `whsec_…` →
Env umstellen. Zahlungsmethoden im Dashboard aktivieren (Karte, SEPA, PayPal, Link, Apple Pay) —
im Code ist `payment_method_types` bewusst nicht hart gesetzt.

### A3. DNS setzen
`kickpact.com` + `www` → A-Record `178.104.49.158`, **DNS-only** (kein CF-Proxy, sonst
kollidiert es mit der Coolify-Zertifikatsausstellung). Die Zone liegt nicht in meinem
CF-Token — entweder du setzt es, oder du gibst mir Zugriff und ich mache es.

### A4. Deploy-Pfad reparieren
Der eigentliche Grund, warum bisher nichts live ging: **`kickpact-prod` hat keinen
GitHub-Webhook.** Zwei Optionen — ich empfehle (a):
- **(a)** Webhook für App `am5tp3laz3p9t3wzh3vt8xpj` auf Branch `production` anlegen → `promote:prod` funktioniert wie gedacht.
- (b) Jeden Release manuell per `coolify.sh deploy am5tp3laz3p9t3wzh3vt8xpj` triggern.

Kann ich mit dem Coolify-API-Key selbst erledigen (`server-host-manager`).

### A5. Erst-Deploy + echte Verifikation
`npm run promote:prod` (bringt production von 36 Commits hinter main auf FF-Stand).
Dann **nicht** dem Push glauben:
1. Coolify-Deployment-Historie: Status `finished`, richtiger Commit-Tag.
2. Container läuft.
3. Migrationen 0000–0069 angewandt (post_deploy `drizzle-kit migrate`).
4. `/api/health` → 200 **vom neuen Container** (ein HTTP-200 kann vom alten kommen).
5. Gegenprobe: `ALLOW_TEST_AUTH` und `E2E_BYPASS` sind auf Prod **nicht** gesetzt.

Coolify-Builds schlagen gelegentlich transient fehl (belegt: 40e54da exit 255 nach 23s) — bei Fehler einfach neu triggern.

### A6. Smoke-Test auf Prod (ich, per Playwright/qa-tester)
Registrierung → Verein/Mannschaft anlegen → fussball.de-Team verknüpfen → Pact bauen →
Trial-Status → Stripe-Checkout mit **echter Karte, kleinster Betrag** → Webhook kommt an →
Abo aktiv → Rechnungs-PDF landet in R2 → Mail zugestellt (Resend-Log) → Storno.
Zusätzlich: Inngest-Cloud-Sync zeigt auf kickpact.com, Crawler-Cron feuert, Sentry empfängt.

---

## Track B — iOS-Launch (parallel bis A5, Submit erst danach)

### B1. Drei Native-Fixes (ich, im Repo)
1. **`PrivacyInfo.xcprivacy` dem Target „App" zuordnen** — Datei existiert seit 17.07., ist aber in `project.pbxproj` **null Mal referenziert**, wird also nicht gebündelt. Führt zu Upload-Reject ITMS-91053.
2. **`aps-environment` → `production`** für die Release-Konfiguration. Aktuell `development`: ein Distribution-Build mit Sandbox-Token gegen den Prod-APNs-Host liefert bei *jeder* Push `BadDeviceToken`. Muss mit `APNS_PRODUCTION=true` im Prod-Env zusammenpassen.
3. **`@capacitor/keyboard` installieren**, `resize: "native"`, `cap sync`. Ohne das verdeckt die Tastatur Eingabefelder in bottom-fixed Sheets (z. B. Sponsor-Discover).

### B2. Prod-Build bauen
**Nur `npm run ios:sync:prod`** — der nackte `cap sync` fällt auf Staging zurück
(`kickpact.schartl.dev`, mit `ALLOW_TEST_AUTH` und geteilter DB). Ein ausgelieferter
Staging-Build wäre ein Datenschutzproblem, kein Schönheitsfehler.
Build-Nummer in `project.pbxproj` hochzählen (aktuell 6; `agvtool` greift hier nicht,
weil die Info.plist `$(CURRENT_PROJECT_VERSION)` referenziert). Dann die bekannte
CLI-Sequenz — inkl. der beiden Fallstricke: Keychain-Partition-List und Homebrew-rsync.

### B3. App Store Connect (Johannes)
- 6 IAP-Startpreise im UI setzen (Pricing-API ist verbuggt): 4,99 / 34,99 / 10,99 / 74,99 / 28,99 / 199,99 €.
- Server Notifications V2 → `https://kickpact.com/api/apple/notifications`, Sandbox und Production getrennt.
- `APPLE_IAP_*`-Env in Coolify-Prod (Bundle-ID, `APPLE_IAP_ENV`, App-Apple-ID, Root-Certs, ASC-Key-Trio).
- Privacy-„Nutrition Label" konsistent zum `PrivacyInfo.xcprivacy` (E-Mail, Name, Push-Identifier).
- Subscription-Metadaten + Review-Screenshot des IAP-Sheets.

### B4. Geräte-Abnahme vor Submit
Kauf je Plan → Entitlement aktiv · `restore()` nach Neuinstallation · Sandbox-Refund → Read-Only ·
Anti-Steering: **keine Web-Preise und kein Stripe in der App sichtbar** (häufigster 3.1.1-Reject) ·
Apple- und Google-Login nativ · Push antippen landet auf dem Deep-Link, nicht auf `/` ·
Logout meldet den APNs-Token ab · externe Links (Impressum/Datenschutz) öffnen im System-Browser.

### B5. Submit
Review dauert erfahrungsgemäß 24–48 h, kann aber mit Rückfragen mehrere Runden gehen.
Deshalb: **Web-Launch nicht an iOS koppeln.**

---

## Reihenfolge

```
Tag 1   A1 Secrets ──┐
        A3 DNS ──────┼─→ A4 Webhook → A5 Deploy+Verify → A6 Smoke-Test → WEB LIVE
        A2 Stripe ───┘
Tag 1   B1 Native-Fixes (parallel, unabhängig)
Tag 2   B2 Prod-Build → TestFlight (braucht A5)
Tag 2   B3 ASC-Metadaten (Johannes, parallel)
Tag 3   B4 Geräte-Abnahme → B5 Submit → Review 24–48h
```

## Wer macht was

**Nur Johannes:** alle Third-Party-Secrets (Stripe/Resend/Inngest/Google/Apple),
Stripe-Live-Aktivierung, ASC-UI (Preise, Metadaten, Privacy-Label), Keychain-Passwort
beim Signing, Geräte-Abnahme mit echtem iPhone.

**Ich, sobald Zugang da ist:** DNS-Records, Coolify-Webhook, Deploy-Trigger und
-Verifikation, die drei Native-Fixes, Build-Nummer, Prod-Smoke-Test, STATE.md
auf den echten Stand bringen.

## Bewusst nicht im Launch-Scope

Referral-Attribution (F2) · Verein-wirbt-Verein · Android/Play-Billing · Kanal-Wechsel
Stripe↔Apple für einen bestehenden Club · Saison-Pässe im In-App-Upsell (monthly-only,
season bleibt Web) · Gemeinnützigkeits-Flag + Spendenübersicht (Privatpersonen-Phase 2).

---

## Track C — Mail (entschieden 2026-07-19: alles auf `.com`)

### C0. Der eigentliche Befund: der Reply-To-Routing-Layer existiert nicht

`lib/mail/reply-to-pure.ts:30` vergibt für **jeden** Pro-/Vereinslizenz-Club eine eigene
Adresse `<club-slug>@kickpact.de` — laut Kommentar „KickPact-Alias, leitet auf den
Vereins-Kontakt weiter". **Diesen weiterleitenden Routing-Layer gibt es nicht.**

Konsequenz heute: Antwortet ein Sponsor auf eine Vereins-Mail, geht die Antwort an
`fc-musterstadt@kickpact.de` → ins Nichts. Kein Bounce beim Verein, keine Fehlermeldung —
**stiller Verlust der Sponsor-Kommunikation**, also genau in dem Moment, in dem Geld
verhandelt wird. Das ist ein Launch-Blocker, aber ein einzeiliger.

Zwei Wege:
- **(a) Empfohlen — echte Vereins-Mail als Reply-To.** `deriveReplyTo` gibt für Pro/Verein
  `club.contactEmail` zurück, Basic bleibt `noreply@kickpact.com`. Ein Diff, kein Catch-all,
  kein Inbound-Webhook, keine Adress-Explosion, kein DSGVO-Zwischenspeicher. Der
  „Routing-Layer" war nie gebaut und wird für v1 auch nicht gebraucht (YAGNI).
- (b) Catch-all `*@kickpact.com` → Inbound-Webhook → Weiterleitung an `club.contactEmail`.
  Braucht Inbound-Parsing, Spam-Filter, Loop-Schutz und Zustellbarkeits-Pflege. Sinnvoll
  erst, wenn du Kommunikation wirklich mitlesen/archivieren willst.

### C1. Adressen umziehen `.de` → `.com`
Produktivcode (Tests/Doku ziehen nach):
- `lib/mail/reply-to-pure.ts:3` — `noreply@kickpact.de`
- `lib/mail/templates/verification-rejected.tsx:10,19` — `support@kickpact.de` ×2
- `lib/invoicing/builder.tsx:329` — Rechnungs-Footer `kickpact.de`
- `MAIL_FROM`-Env auf `KickPact <hello@kickpact.com>`
- Hilfe-Center-Artikel (`support@`, `hello@`, URLs) + `docs/pricing.md`

### C2. Inbound-Postfächer
Gebraucht werden real: `support@` (Kunden), `info@`/`hello@` (allgemein, Absender der
Magic-Links), `admin@`/`operator@` (Operator-Account). Alles andere sind Aliase.

**Empfehlung: Cloudflare Email Routing — 0 €.** Unbegrenzte Aliase, empfangen und an dein
bestehendes Postfach weiterleiten; die Zone liegt ohnehin schon bei Cloudflare. Zum
*Antworten als* `support@kickpact.com`: Resend-SMTP-Credentials in Gmail unter
„Senden als" hinterlegen — Resend hast du schon.

Wenn du echte, getrennte Postfächer willst (eigenes Login pro Adresse, IMAP):
**Migadu Micro ~19 $/Jahr**, unbegrenzt Postfächer und Domains, kein Preis pro Nutzer —
für 3+ Adressen deutlich günstiger als alles mit Per-User-Preis.
Zum Vergleich: Zoho Mail Lite ~1 €/Nutzer/Monat (die Gratis-Stufe kann **kein IMAP**,
also kein Apple Mail auf dem iPhone), Google Workspace ab ~6 €/Nutzer/Monat.

**MX-Kollision vorher prüfen:** Cloudflare Email Routing setzt MX auf der Apex-Domain.
Resend braucht MX nur auf der Versand-Subdomain (`send.kickpact.com`) für Bounces —
kollidiert also nicht, muss aber genau so eingerichtet werden.

### C3. Zustellbarkeit
SPF, DKIM und DMARC für `kickpact.com` bei Resend verifizieren, DMARC startet auf
`p=none`. Ohne verifizierte Domain landen Magic-Links im Spam — und ein Magic-Link im
Spam-Ordner ist ein Nutzer, der sich nie einloggt.

---

## Offen

- **Staging-Secret-Rotation.** Am 16.07. sind gekürzte Staging-Secret-Fragmente in ein
  Transcript geraten (`BETTER_AUTH_SECRET`, Stripe-Test-`whsec`, Resend). Kein Prod-Risiko,
  aber bei Gelegenheit rotieren.
- **Status-Monitor.** `kickpact.com` in Uptime Kuma (`status.schartl.dev`) eintragen —
  nicht launch-blockierend, aber innerhalb der ersten Stunde nach Live.
- **Plausible.** `PLAUSIBLE_DOMAIN` steht auf `kickpact.de`, muss auf `.com`.
