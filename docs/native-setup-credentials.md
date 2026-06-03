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

## 2) Google-Login nativ — wartet auf Client-IDs

**Status Code:** ⏳ vorbereitet. Google ist in der App aktuell **bewusst
ausgeblendet** (Google blockt OAuth in WebViews). Der native Weg ist der
idToken-Flow (analog zum bereits laufenden Apple-Native-Login).

**Was DU machst (Google Cloud Console → APIs & Services → Credentials):**
1. **iOS-OAuth-Client** erstellen → Bundle ID `com.kickpact.app`.
   → liefert eine **iOS-Client-ID** + eine **reversed client ID**
   (`com.googleusercontent.apps.XXXX`) für das URL-Scheme.
2. Falls noch nicht vorhanden: den bestehenden **Web-OAuth-Client** bereithalten
   (dessen Client-ID ist die `serverClientId` für die idToken-Audience).

**Was DU mir gibst:** die **iOS-Client-ID** (+ reversed) und die **Web-Client-ID**.

**Dann mache ICH (ein Durchgang, dann brauchst du 1× Xcode-Rebuild):**
- `@codetrix-studio/capacitor-google-auth` installieren + `npx cap sync ios`
- `GIDClientID` + URL-Scheme (reversed iOS-ID) in `ios/App/App/Info.plist`
- `serverClientId` in `capacitor.config.ts` (Plugin-Block)
- Native Google-Branch in `components/auth/oauth-buttons.tsx`
  (`GoogleAuth.signIn()` → `signIn.social({ provider: "google", idToken })`)
- Google in der App wieder einblenden (Guard in login/signup-Page entfernen)
- better-auth Google-Audience auf die iOS-Client-ID erweitern

> Grund, warum ich hier nicht „blind" vorbaue: Plugin-Config (Info.plist-Scheme,
> serverClientId) braucht die echten IDs und einen Geräte-Test — halb gesetzte
> Werte würden nur den nächsten Build gefährden. Mit den IDs ist es ein sauberer,
> getesteter Durchgang.
