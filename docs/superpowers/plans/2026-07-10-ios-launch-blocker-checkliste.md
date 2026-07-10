# iOS-Launch-Blocker-Checkliste (Audit 2026-07-10)

Aus dem 4-Agenten-Adversarial-Audit (Apple-Store/IAP, WKWebView-Runtime,
Mobile-UI/Push, Deploy-Skew). Die **Web-seitigen** Fixes sind im Code umgesetzt
und greifen beim nächsten Coolify-Deploy sofort (Remote-WebView). Die folgenden
Punkte brauchen einen **Xcode-/Native-Rebuild** oder eine **Entscheidung** und
sind vor dem ersten Store-Submit abzuhaken.

## Entscheidung (BLOCKER)

- [ ] **Prod-Domain final festlegen: `kickpact.com` vs `kickpact.de`.**
  Der gesamte Stack (better-auth `trustedOrigins`/`BETTER_AUTH_URL`,
  `NEXT_PUBLIC_BASE_URL`, base-url-Fallback, robots/sitemap, DEPLOYMENT.md)
  nutzt **`kickpact.com`**. `kickpact.de` stand nur im Capacitor-Kommentar +
  2 Textstellen (jetzt auf `.com` angeglichen). `capacitor.config.ts` `server.url`
  MUSS exakt = Web-Origin sein, sonst verwirft better-auth den Origin und die
  App bleibt dauerhaft ausgeloggt (host-only `__Secure-`-Cookie). → Ist `.com`
  bestätigt, ist nichts weiter zu tun; soll es `.de` sein, muss der ganze
  Auth-/DNS-Stack darauf umgestellt werden.

## Native-Build (Xcode) — vor Store-Submit

- [ ] **`PrivacyInfo.xcprivacy` der App-Target-Mitgliedschaft zuordnen.**
  Datei ist angelegt (`ios/App/App/PrivacyInfo.xcprivacy`), muss in Xcode aber
  dem Target „App" zugewiesen sein (File Inspector → Target Membership), sonst
  wird sie nicht gebündelt → Upload-Reject ITMS-91053 bleibt. Inhalt mit dem
  App-Store-Connect-Privacy-Label konsistent halten.
- [ ] **`aps-environment` für Release auf `production`.** `App.entitlements`
  steht auf `development` (Sandbox). Ein Distribution-Build mit Sandbox-Token +
  Prod-APNs-Host (`APNS_PRODUCTION=true`) → jede Push `BadDeviceToken` = Push
  tot. Über automatisches Signing/Release-Entitlements auf `production` auflösen
  und gegen `APNS_PRODUCTION` im Prod-Env spiegeln.
- [ ] **`@capacitor/keyboard` installieren + `cap sync`.** Fehlt aktuell → in
  bottom-fixed Sheets mit Text-Input (z.B. Sponsor-Discover) verdeckt die
  iOS-Tastatur das Feld. `resize: "native"` konfigurieren.
- [ ] **Prod-Sync nur über `npm run ios:sync:prod`** (setzt
  `CAP_SERVER_URL=https://kickpact.com`). Der nackte `cap sync` fällt auf Staging
  (`kickpact.schartl.dev`) mit `ALLOW_TEST_AUTH` + geteilter DB — ein
  ausgelieferter Staging-Build ist ein Sicherheits-/Datenschutzproblem. Die
  Config warnt jetzt laut bei fehlendem Override.

## App-Store-Connect (Metadaten)

- [ ] Subscription-Metadaten (lokalisierte Beschreibung, Review-Screenshot des
  IAP-Sheets) + App-Privacy-„Nutrition Label" (E-Mail, Name, Push-Identifier)
  konsistent zum `PrivacyInfo.xcprivacy`.
- [ ] Prüfen, dass `APPLE_CLIENT_ID`/`APPLE_CLIENT_SECRET` (6-Monats-JWT) und
  `CAP_SERVER_URL` in der Prod-Coolify-Env gesetzt sind.

## Optional / niedrig (weiche 3.1.3-Copy)

- [ ] Marketing-Preis-Hook „unter 1 € pro Spieler" im Intro-Wizard (nativer
  Einstiegsscreen) — Wertversprechen ohne Kauf-CTA, grenzwertig. Bei Bedarf in
  der App weglassen (fokussierter Copy-Pass, nicht dringend).

## Auf Gerät verifizieren (nach Rebuild)

- [ ] Login-Flows (Apple + Google nativ) in der App; Magic-Link ist in der App
  ausgeblendet (öffnete in Safari, Cookie-Leck).
- [ ] Push antippen → landet auf Deep-Link (`data.link`), nicht auf `/`.
- [ ] Logout meldet den APNs-Token ab (kein Push-Leak auf geteiltem Gerät).
- [ ] Externe Links (Impressum/Datenschutz/Stripe) öffnen im System-Browser,
  nicht gefangen in der WebView.
