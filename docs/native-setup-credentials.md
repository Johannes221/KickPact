# Native iOS — Credential-Setup (Push & Google-Login)

Der gesamte **Code** für beide Features ist fertig und deployt. Was hier steht,
sind die Schritte, die **nur du** in den Apple-/Google-Portalen erledigen kannst.
Danach übernehme ich den Rest (Env eintragen bzw. Plugin verdrahten).

---

## 1) Push-Benachrichtigungen (APNs) — fast fertig

**Status Code:** ✅ komplett.
- APNs-Transport (`lib/notifications/apns.ts`, ES256-JWT + HTTP/2, No-Op ohne Key)
- Device-Token-Route (`/api/native/push-token`) + Storage (`device_tokens`)
- Alle Event-Trigger verdrahtet (Spielergebnis, Zugriff, Sponsor, Lead, Trial, Rechnung)
- iOS-Entitlement `aps-environment` ist im Projekt
- Rationale-first Permission: **kein** Auto-Dialog beim Start; „Aktivieren"-Button
  in **Mein Konto → Benachrichtigungen**

**Was DU machst (Apple Developer Portal):**
1. **Keys → +** → „Apple Push Notifications service (APNs)" aktivieren → erstellen.
2. Die **`.p8`-Datei** herunterladen (nur EINMAL möglich!) + **Key ID** notieren.
3. Team ID ist bereits bekannt: `A5SM7VJ6M2`.
4. Sicherstellen, dass die App-ID `com.kickpact.app` die Capability
   **Push Notifications** aktiviert hat (Identifiers → com.kickpact.app).

**Was DU mir gibst:** die `.p8`-Datei (oder ihren Inhalt) + die **Key ID**.

**Dann setze ICH** diese Env-Variablen (Coolify, Production-Service):
```
APNS_KEY_ID=<deine Key ID>
APNS_TEAM_ID=A5SM7VJ6M2
APNS_BUNDLE_ID=com.kickpact.app
APNS_PRIVATE_KEY=<Inhalt der .p8, inkl. BEGIN/END-Zeilen>
APNS_PRODUCTION=false   # Sandbox für Dev-Builds; true erst beim App-Store-Build
```
> Wichtig: `APNS_PRODUCTION` muss zur Signierung des Builds passen — Dev/TestFlight
> = `false` (Sandbox), App-Store-Release = `true`. Falsch → APNs-Reason
> `BadDeviceToken`. Kein App-Rebuild nötig, nur die Env + Service-Restart.

---

## 2) Google-Login nativ — Code fertig, wartet auf Rebuild + Env

**Status Code:** ✅ komplett verdrahtet (2026-06-03).
- Plugin `@codetrix-studio/capacitor-google-auth@3.4.0-rc.4` installiert + `cap sync` (Pod drin)
- `GIDClientID` + reversed URL-Scheme in `ios/App/App/Info.plist`
- `serverClientId` (Web) + `iosClientId` in `capacitor.config.ts`
- Nativer Google-Branch in `oauth-buttons.tsx` (`GoogleAuth.signIn()` → idToken → `signIn.social`)
- better-auth akzeptiert beide Audiences (Web + iOS) via `googleVerifyIdToken` in `lib/auth/server.ts`

Client-IDs (Projekt `61970500774`):
- **Web:** `61970500774-gvsogfm2m7tn1sdsnk06qvl1e3ffhn4g.apps.googleusercontent.com`
- **iOS:** `61970500774-vndgkcbi8073g8hk91jsb9rml1747nn9.apps.googleusercontent.com`
- **reversed:** `com.googleusercontent.apps.61970500774-vndgkcbi8073g8hk91jsb9rml1747nn9`

**Sequenz (wichtig — Reihenfolge verhindert kaputten Button):**
Der Google-Button erscheint in der App NUR, wenn die Server-Env
`GOOGLE_IOS_CLIENT_ID` gesetzt ist. So taucht er nie in einem App-Build ohne das
Plugin auf.

1. **DU:** In Xcode einmal neu bauen + auf dem iPhone installieren (zieht das
   GoogleAuth-Plugin/den Pod). → sag mir „rebuild fertig".
2. **ICH:** setze dann `GOOGLE_IOS_CLIENT_ID=61970500774-vndgkcbi8073g8hk91jsb9rml1747nn9.apps.googleusercontent.com`
   als Coolify-Env → Google-Button erscheint in der App und der native Login läuft.

> Hinweis: cap sync auf diesem Mac braucht UTF-8-Locale, sonst bricht `pod install`
> mit `Encoding::CompatibilityError` ab → vor dem Build
> `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.
