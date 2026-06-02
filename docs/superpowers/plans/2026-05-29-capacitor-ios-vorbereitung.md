# Capacitor / iOS-App — Vorbereitungs- & Rollout-Plan

**Datum:** 2026-05-29
**Status:** Groundwork umgesetzt (web-inert). Eigentliche Capacitor-Integration **zurückgestellt** bis die Web-App „einigermaßen fertig" ist (Nutzer-Entscheidung).
**Ziel:** KickPact als iOS-App auf TestFlight → App Store, mit minimalem Aufwand und ohne UI-Rewrite.

## Strategie-Entscheidung (gebacken)

**Capacitor-WebView-Wrapper**, kein React-Native/Expo-Rewrite, kein natives Swift.

**Definition „high-end clean iOS feel" (festgelegt 2026-05-29):** poliert, schnell, kein Browser-Gefühl — native Navigations-Chrome, Transitions, Haptik, Push, **genuin native In-App-Käufe (StoreKit-Sheets)**. Bewusst **nicht** pixel-natives SwiftUI je Screen — die Screens bleiben die (polierte) mobile Web-UI. Der Nutzer hat diese Definition akzeptiert; „keine halben Sachen" bezieht sich auf Politur + echte native Käufe/Push, nicht auf einen Native-UI-Rewrite.

**Warum:** KickPact ist eine server-zentrierte Next.js-15-App — ~76 Pages (überwiegend Server Components), 35 `"use server"`-Dateien, 22 Server-Action-Ordner, 98 Client-Komponenten auf shadcn/Radix + recharts + react-pdf. Die Geschäftslogik lebt auf dem Server; es gibt keinen abkoppelbaren Client. Ein RN/Expo-Rewrite müsste jede Server-Action erst zu einer REST-API machen und die komplette UI in RN-Primitiven neu bauen (Monate). Capacitor lädt stattdessen die deployte Web-App in einem nativen WebView — die bestehende Codebasis bleibt 1:1 nutzbar.

**Trade-off:** Apple-Review-Guideline **4.2 („minimum functionality")** kann reine WebView-Wrapper ablehnen. Mitigation = native Features (Push-Notifications, natives Splash/Icon, Statusbar-Integration) — siehe WS-4.

## Was JETZT erledigt ist (web-inert, 2026-05-29)

Diese Änderungen haben im Desktop-Browser **null sichtbaren Effekt**, aktivieren aber das native Verhalten, sobald der Wrapper existiert:

- **`viewport-fit=cover` + iOS-Meta** in [app/layout.tsx](../../../app/layout.tsx) — `export const viewport` mit `viewportFit: "cover"` + `themeColor`. Ohne `cover` liefert `env(safe-area-inset-*)` auf iOS immer 0; die Bottom-Tab-Bar nutzt diese Insets bereits. Plus `appleWebApp`-Metadata (standalone Statusbar).
- **Safe-area-CSS-Utilities** in [app/globals.css](../../../app/globals.css) — `.pt-safe / .pb-safe / .pl-safe / .pr-safe / .min-h-safe-top`. Wiederverwendbar für fixed Header/Footer/Sheets.
- **Header-Top-Inset** in [components/shared/app-header.tsx](../../../components/shared/app-header.tsx) — fixed Header bekommt `pt-[env(safe-area-inset-top)]`, der Spacer wird `calc(60px + env(safe-area-inset-top))`. Auf Web = 60px (unverändert), auf iPhone rückt die Bar unter den Notch.
- Die **Bottom-Tab-Bar** ([components/shared/bottom-tab-bar.tsx](../../../components/shared/bottom-tab-bar.tsx)) nutzte `pb-[env(safe-area-inset-bottom)]` bereits — funktioniert jetzt durch `viewport-fit=cover` tatsächlich.

## Voraussetzungen (extern, vom Nutzer zu besorgen)

1. **Apple Developer Program** — 99 $/Jahr. ✓ **vorhanden** (Nutzer hat Konto, 2026-05-29).
2. **Mac mit Xcode** — ✓ **vorhanden** (Xcode 26.2, Apple Silicon, verifiziert 2026-05-29). Builds laufen also lokal auf dieser Maschine; kein Cloud-Mac nötig.
3. **App-Bundle-ID** festlegen, z.B. `com.kickpact.app`. Muss zur `APPLE_BUNDLE_ID`-ENV passen (Apple-Sign-in ist in [lib/auth/server.ts:26](../../../lib/auth/server.ts) schon darauf vorbereitet).
4. **Apple Sign-in ist Pflicht**, sobald Google-Login angeboten wird (Guideline 4.8). Ist bereits konfiguriert — nur Keys/Provider live schalten.

## ✅ SPIKE ERFOLGREICH (2026-06-02) — App läuft im iOS-Simulator

Nach Reparatur der defekten Simulator-Runtime (siehe unten) läuft KickPact als Capacitor-App im iOS-Simulator (iPhone 17, iOS 26.3). **Per Screenshot verifiziert:**
- **WebView lädt Staging (`kickpact.schartl.dev`) und rendert die App nativ + korrekt** — Landing-Page komplett, Safe-Area/Notch sauber.
- **Login-UI rendert vollständig im WKWebView** — „Mit Google fortfahren", „Mit Apple fortfahren", Magic-Link-Mailfeld, „Account anlegen". Alle drei Auth-Wege da.
- Damit ist die größte Unbekannte (lädt + rendert die remote Next.js-App im iOS-WebView?) **bewiesen**.

**Runtime-Fix, der den Simulator wiederbelebt hat (für die Doku):** Der iOS-26.2-Simulator-Runtime war korrupt (simctl + ibtool hingen endlos; Reboot/Device-Reset half nicht). Lösung: `open -a Simulator` (revived den CoreSimulator-Service, sodass simctl wieder antwortete) → dann **iOS-Runtime per `xcodebuild -downloadPlatform iOS` neu geladen** (frische iOS 26.3.1) → neues Device darauf angelegt → bootet stabil, ibtool/actool laufen sauber, App-Build vollständig (inkl. Info.plist/Bundle-ID).

**Auth-Kette zusätzlich verifiziert (curl gegen Staging, 2026-06-02):**
- Auth-Gate: `/dashboard` → **307 Redirect auf `/login`** (dieselbe Kette läuft im WebView).
- Auth-Backend: Test-Stub liefert **HTTP 200 + gültige signierte Session** (`__Secure-better-auth.session_token`, Secure/HttpOnly/SameSite=lax) → Cookie-Signierung & Session-Erstellung gegen die Staging-Instanz funktionieren. (Test-User danach wieder gelöscht — shared DB clean.)

**✅ Cookie-Persistenz im WebView bewiesen (2026-06-02):** Über den echten better-auth-Magic-Link-Flow (Token aus DB gelesen, WKWebView auf Verify-URL navigiert) eine Session gesetzt → nach **komplettem App-Neustart auf root** zeigt der **In-App-WKWebView den eingeloggten Zustand** (Account-Avatar statt „Loslegen"), fullscreen ohne Safari-Chrome. Die `__Secure-better-auth.session_token`-Cookie überlebt App-Neustarts im persistenten `WKWebsiteDataStore`. Cookie-Auth (WS-2 Variante A) trägt also im Standalone-WebView — **Bearer-Token-Fallback (WS-3) nicht nötig.**

**⚠️ Beobachtung Magic-Link-Handoff (bestätigt WS-3-Risiko):** Beim Laden der Verify-URL gab es einen Safari-Seitensprung. Im echten Flow (Mail-Link → öffnet Safari → Cookie landet in Safari, nicht im App-WebView) ist das der bekannte Knackpunkt. **Lösung bleibt:** native **Apple-/Google-Sign-in** als primärer App-Login (kein Mail-Redirect, schließt in-app ab) und/oder Universal Links für den Magic-Link. Cookie-Persistenz selbst ist davon unberührt (s.o.).

**Noch offen (nur interaktiv möglich):** der echte Login-**Roundtrip** — Magic-Link-Mail anklicken bzw. Apple/Google-OAuth durchlaufen + Cookie-Session-Persistenz über App-Neustart. Braucht echtes Mailpostfach / Apple-ID → vom Nutzer im (jetzt laufenden) Simulator durchzuklicken oder beim TestFlight-Build. Spike bleibt bootbar: Device-UDID `2FA9B7B7-C679-4199-9B9D-A614E67D46FB`, App `dev.schartl.kickpactspike`, Bundle in `~/capacitor-ios-spike`.

## Spike-Ergebnisse (2026-06-01) — Build-Kette verifiziert, Auth-Test offen

Isolierter Spike in `~/capacitor-ios-spike` (außerhalb des Repos, `server.url` → `https://kickpact.schartl.dev`). **KickPact-Repo unberührt.**

**✅ Verifiziert — die komplette Build-Kette funktioniert:**
- Capacitor-Projekt + `npx cap add ios` → Xcode-Projekt generiert
- `pod install` erfolgreich (2 Pods: Capacitor, CapacitorCordova)
- `xcodebuild -sdk iphonesimulator26.2 … build` → **`App.app` erfolgreich kompiliert**

**Konkrete Gotchas (für die echte Integration in WS-1 einplanen):**
1. **Node 22 nötig:** Capacitor-8-CLI bricht auf Node 20 hart ab (`requires NodeJS >=22`). Projekt fährt aktuell Node 20.19.5 → vor WS-1 `.nvmrc` + CI auf Node 22 heben. (Spike lief deshalb auf Capacitor **6**.)
2. **CocoaPods-Locale:** `pod install` scheitert ohne `LANG=en_US.UTF-8`/`LC_ALL` (Ruby `Encoding::CompatibilityError`). In Build-Doku/CI exportieren.
3. **CoreSimulator wedged:** `xcrun simctl` hängt auf dieser Maschine reproduzierbar (Service-Kill half nicht) → **Reboot nötig**, um einen Simulator zu booten. Build (Compile) braucht kein simctl, Booten/Installieren/Launchen schon.

**⏳ Noch offen — der eigentliche Risiko-Test (Auth im Standalone-WebView):**
Konnte nicht durchgeführt werden, weil der Simulator nicht bootet (Punkt 3). Nächster Schritt nach Reboot **oder** mit angeschlossenem iPhone: App.app installieren, launchen, Staging laden, Magic-Link + Apple-Sign-in durchspielen, Cookie-Session-Persistenz über App-Neustart prüfen. Build-Artefakt liegt bereit (`~/capacitor-ios-spike/ios/App/build/.../App.app`), kein Rebuild nötig.

**Permanentes Artefakt im Repo:** [lib/platform/native.ts](../../../lib/platform/native.ts) — web-sicherer Platform-Detector (`isIOSApp()` etc.), Basis fürs spätere IAP-/Anti-Steering-Branching.

## Workstreams (wenn die App „fertig" ist)

| WS | Was | Hängt ab von | Risiko |
|---|---|---|---|
| **0** Groundwork (viewport/safe-area) | ✓ erledigt 2026-05-29 | — | — |
| **1** Capacitor-Scaffold | ✅ **erledigt 2026-06-02 im Repo** (s.u.) | 0 | — |
| **2** Server-URL-Strategie (WebView lädt remote) | Config auf Prod-URL zeigen, Cookie/CORS klären | 1 | **mittel** |
| **3** Auth im WebView (Bearer-Token) | better-auth Bearer-Plugin + Secure-Storage | 2 | **mittel-hoch** |
| **4** Native Mindestausstattung (4.2-Mitigation) | Push, Splash, Icon, Statusbar | 1 | mittel (Review) |
| **5** Build + TestFlight-Pipeline | Signing, Archive, Upload | 1–4 | niedrig |
| **6** Feature-Plugins (PDF/CSV/Clipboard/Upload) | je 1 Capacitor-Plugin, siehe Funktions-Audit | 1 | niedrig |
| **7** Abo Dual-Provider (Stripe Web **+** Apple IAP) | IAP-Plugin + Entitlement-Reconciliation, siehe eigener Abschnitt | 2 | **hoch** |

### WS-1 — Capacitor-Scaffold ✅ ERLEDIGT (2026-06-02, im Repo)

Umgesetzt auf Branch `feat/ios-push-notifications` (baute auf bestehendem WIP auf, das `@capacitor/core@^6` + `@capacitor/push-notifications@^6` bereits in package.json hatte):
- **Deps:** Capacitor **6** (Node-20-kompatibel, kein Repo-Node-Bump nötig) — `@capacitor/core`, `/cli` (dev), `/ios`, `/push-notifications`.
- **[capacitor.config.ts](../../../capacitor.config.ts):** `appId: "com.kickpact.app"`, `appName: "KickPact"`, `webDir: "capacitor-www"`, `server.url` env-gesteuert (`CAP_SERVER_URL`, Default Staging `kickpact.schartl.dev`; Prod-Build: `CAP_SERVER_URL=https://kickpact.de`).
- **[capacitor-www/index.html](../../../capacitor-www/index.html):** minimaler Lade-Fallback (nur sichtbar wenn Remote-URL nicht erreichbar).
- **`ios/`** Xcode-Projekt generiert (`npx cap add ios`), `pod install` ok (LANG=en_US.UTF-8 nötig), Push-Plugin integriert. Capacitor legte `ios/.gitignore` an (Pods/build/DerivedData/public ignoriert).
- **Verifiziert:** Repo-`ios/`-Projekt baut gegen iphonesimulator-SDK (`BUILD SUCCEEDED`), App.app läuft im Simulator, lädt Staging, rendert fullscreen In-App-WebView. ✅

**Offene WS-1-Entscheidung:** Bundle-ID `com.kickpact.app` ist Default — muss final festgelegt werden (bindet App-Store-Connect-Record + Apple-Sign-in Service-ID; später schwer änderbar).

**Hinweis:** `webDir` ist **nicht** statischer Export — die App braucht den laufenden Next-Server. WebView lädt remote via `server.url`; Capacitor = native Hülle + Plugin-Bridge.

### WS-2 — Server-URL & Cross-Origin (der Knackpunkt)
Der WebView läuft unter `capacitor://localhost` (iOS), die App-Inhalte kommen von `https://kickpact.com`. Optionen:
- **A (empfohlen):** `server.url = "https://kickpact.com"` → WebView ist same-origin zur App, Cookies funktionieren wie im Browser. Einfachster Weg, aber die App ist „online-only" (kein Offline).
- **B:** Statische Shell lokal + API cross-origin → erzwingt Token-Auth (WS-3) und ist mit Server Components unvereinbar. **Nicht empfohlen** für diese Architektur.
→ **Entscheidung: A.** Damit ist WS-3 evtl. nur teilweise nötig (Cookies tragen die Session). Bearer-Token bleibt Fallback, falls iOS-WebView-Cookie-Persistenz im standalone-Modus Probleme macht.

### WS-3 — Auth im WebView
better-auth Cookie-Sessions funktionieren im WebView, ABER:
- **Magic-Link-Redirect** (`expiresIn: 15min`, [lib/auth/server.ts:83](../../../lib/auth/server.ts)): Der Link aus der E-Mail öffnet Safari, nicht die App → Session landet im falschen Kontext. **Lösung:** Universal Links / `@capacitor/app` `appUrlOpen`-Listener, der den Magic-Link in den WebView zurückholt. **ODER** Apple-Sign-in als primärer App-Login (nativer Flow, kein Mail-Redirect).
- **Bearer-Token-Fallback:** better-auth `bearer()`-Plugin aktivieren + Token in `@capacitor/preferences` / Keychain. Web-inert (Cookie-Auth bleibt parallel). Erst bauen, wenn Cookie-Weg im standalone-WebView scheitert — nicht auf Verdacht.
- **Apple-Sign-in nativ:** `@capacitor-community/apple-sign-in` für den nativen Dialog statt OAuth-Web-Redirect (bessere UX + Review-freundlich).

### WS-4 — Native Mindestausstattung gegen Guideline 4.2
- **Push-Notifications:** `@capacitor/push-notifications` + APNs-Key. Naheliegende Trigger aus der Domain: neue Sponsoring-Charge, Monats-Rechnung fertig, Verifikation freigegeben — passt zu den bestehenden Inngest-Jobs ([lib/inngest/functions/](../../../lib/inngest/functions/)). Stärkstes Argument gegen 4.2.
- **Splash + Icon:** `@capacitor/splash-screen`, Assets aus dem KickPact-Brand (Orange/Lime/Navy, `ui-ux-pro-max`).
- **Statusbar:** `@capacitor/status-bar` — Style passend zu `themeColor` (#F5F8F5, hell → dunkle Icons).
- Optional: `@capacitor/haptics` bei Pledge-Bestätigung o.ä. für „echtes App-Gefühl".

### WS-5 — Build & TestFlight
1. App-ID + Push-Capability im Apple Developer Portal anlegen.
2. Xcode: Signing-Team setzen, Bundle-ID, Push-Entitlement.
3. `npm run build` (Prod) ist hier irrelevant für den Wrapper-Build, weil remote geladen wird — aber die Prod-Domain muss live + erreichbar sein.
4. `npx cap sync ios` → `npx cap open ios` → Archive → Upload zu App Store Connect.
5. TestFlight: interne Tester (sofort) → externe (Beta-Review, ~1 Tag).
6. App-Store-Review: Datenschutz-Nutrition-Label, Demo-Account für Reviewer, 4.2-Begründung (Push + Domain-spezifischer Mehrwert).

## WS-6 — Funktions-Audit: Feature → WebView-Status → Plugin

Vollständiger Durchgang der App-Funktionalität (2026-05-29). **Kein Feature ist mit Capacitor unmöglich.** Die ⚠️-Punkte sind je ein kleines Plugin, kein Architektur-Problem. Der einzige Policy-Konflikt ist das Abo (eigener Abschnitt unten).

| Feature | Stelle im Code | WebView | Maßnahme / Plugin |
|---|---|---|---|
| Server Components / Actions / alle 76 Pages | gesamt | ✅ läuft | App lädt Prod-Domain remote (WS-2) |
| **Stripe-Abo-Checkout** | [lib/actions/subscriptions.ts](../../../lib/actions/subscriptions.ts) | ⚠️ Policy | Einziger Apple-Konflikt → Abschnitt „Abo-Entscheidung" |
| Login Magic-Link (E-Mail) | [lib/auth/server.ts](../../../lib/auth/server.ts) | ⚠️ lösbar | Universal Links / `appUrlOpen` ODER Apple-Sign-in als primärer Login (WS-3) |
| Login Google / Apple OAuth | lib/auth | ✅ / besser nativ | `@capacitor-community/apple-sign-in` für nativen Dialog |
| **PDF-Rechnungen** (`window.open`) | [invoices-table.tsx](../../../app/\(verein\)/verein/[slug]/abrechnungen/_components/invoices-table.tsx), [sponsor-invoices-list.tsx](../../../app/\(sponsor\)/sponsor/rechnungen/_components/sponsor-invoices-list.tsx) | ⚠️ Plugin | `window.open` öffnet im WebView nicht zuverlässig → `@capacitor/browser` (`Browser.open`) |
| **CSV-Export** (`a.click()` Download) | [csv-export-button.tsx](../../../components/shared/csv-export-button.tsx) | ⚠️ Plugin | Download via `@capacitor/filesystem` + `@capacitor/share` (Share-Sheet) |
| **Datei-Upload** (Verifikation-PDF, Logo) | verification-form, team-stammdaten-form, request-form | ✅ / 📷 besser | `<input type=file>` funktioniert; `@capacitor/camera` macht Foto-Upload nativer |
| **Einladungslinks kopieren** (`navigator.clipboard`) | sponsoren-step, invite-form, pending-invitations-table, sponsors-manager (4 Stellen) | ⚠️ Plugin | `navigator.clipboard` im WKWebView unzuverlässig → `@capacitor/clipboard` |
| Charts (recharts), QR-Codes | diverse | ✅ läuft | reines Rendering |
| fussball.de-Scraping, Inngest-Jobs, Mail (Resend), Sentry, Plausible | Backend | ✅ irrelevant | alles serverseitig, kein App-Bezug |
| Push-Notifications | — (neu) | ➕ ergänzen | `@capacitor/push-notifications` (zugleich 4.2-Argument, WS-4) |

**Implementierungsmuster für die ⚠️-Plugin-Punkte:** nicht hart auf Capacitor umbauen, sondern Web-Fallback behalten und nur im Native-Kontext abzweigen:
```ts
import { Capacitor } from "@capacitor/core";
if (Capacitor.isNativePlatform()) { /* Plugin-Pfad */ } else { /* bisheriger Web-Pfad */ }
```
So bleibt der Web-Build unverändert und derselbe Code trägt beide Plattformen.

## Abo — Dual-Provider: Stripe (Web) + Apple IAP (iOS)

**Nutzer-Entscheidung 2026-05-29:** Beide Wege parallel — im Web/Online weiter Stripe-Checkout, in der iOS-App native Apple-Subscriptions. Das ist möglich und Apple-konform, ist aber der aufwändigste Posten im Plan.

**Apple-Regel 3.1.1:** Ein in der iOS-App verkauftes Abo MUSS über StoreKit-IAP laufen (15–30 % Cut) — Stripe-Checkout in der App ist verboten. Stripe im **Web** bleibt erlaubt. **Anti-Steering (3.1.3):** Innerhalb der iOS-App **nicht** auf Web-Preise/Stripe-Checkout verlinken oder hinweisen. Native IAP läuft via Capacitor-Plugin (kein React Native).

### Architektur-Anforderung: zwei Provider, eine Wahrheit
Eine Club-Subscription kann künftig aus **Stripe ODER Apple** stammen. Das Entitlement („ist dieser Club aktiv abonniert?") muss beide Quellen kennen.

1. **Schema:** `subscriptions` braucht ein `provider`-Feld (`stripe` | `apple`) + Apple-Identifier (originalTransactionId / RevenueCat-Customer). Aktuell ist die Tabelle reine Stripe-Annahme (`stripeCustomerId`, `stripeSubscriptionId` — [lib/actions/subscriptions.ts](../../../lib/actions/subscriptions.ts)).
2. **Apple-Seite einlesen:** App Store Server Notifications v2 → Webhook (analog [app/api/stripe/webhook](../../../app/api/stripe)) hält Apple-Subs aktuell (Renewal, Cancel, Refund, Grace-Period laufen über Apple, nicht über uns).
3. **Doppel-Abo verhindern:** Hat ein Club bereits ein Stripe-Abo, darf der In-App-Kauf nicht zusätzlich abrechnen — und umgekehrt. Vor dem IAP-Kauf serverseitig den bestehenden Provider prüfen und ggf. blocken/erklären.
4. **B2B-Mapping:** Apple-IAP hängt am **persönlichen Apple-ID** des Käufers, KickPact-Abo am **Club**. Das Entitlement muss am Club hängen, nicht am Apple-Account. Sauber via RevenueCat `appUserID = clubId`. Edge-Case dokumentieren: Käufer verlässt den Club → Abo-Verwaltung (Kündigen/Refund) liegt weiter in dessen Apple-Account.

### Source-of-Truth: RevenueCat (festgelegt 2026-05-29)
**Entscheidung: RevenueCat** als einheitliche Entitlement-Schicht für beide Provider.
- Abstrahiert StoreKit + App Store Server Notifications und liefert eine einheitliche Entitlement-API.
- Kann **auch Stripe einlesen** → ein einziger „ist-aktiv?"-Check für Web- **und** App-Abos, statt zwei getrennte Abgleichspfade.
- `appUserID = clubId` löst das B2B-Mapping (Entitlement am Club, nicht am Apple-Account).
- Trade-off bewusst akzeptiert: Zusatzsystem + Kosten ab Umsatzschwelle — dafür entfällt der Großteil der selbstgebauten Reconciliation (Renewals/Grace-Period/Refunds/Sandbox-vs-Prod).
- Verworfen: Self-built Apple-Webhook + eigene Abgleichslogik — zu viel fehleranfälliger Eigen-Code bei Dual-Provider.

**Konsequenz fürs Schema:** Statt roher `apple_*`-Spalten genügt in `subscriptions` ein `provider`-Feld + die RevenueCat-Referenz; RevenueCat ist die Wahrheit, unsere Tabelle der gecachte Spiegel (befüllt via RevenueCat-Webhook).

### UI-Verzweigung
- iOS-Kontext (`Capacitor.isNativePlatform()`): Kauf-Flow zeigt **StoreKit-Produkte**, nicht den Stripe-Button. Keine Web-Preis-Hinweise (Anti-Steering).
- Web-Kontext: unverändert Stripe-Checkout.
- Verwaltung/Kündigen: im iOS-Abo über Apples Abo-Verwaltung; bei Stripe-Abos über das bestehende Customer-Portal.
- **Online-only akzeptabel?** Variante A heißt: ohne Netz keine App. Für eine Sponsoring-/Abrechnungs-App vermutlich ok.
- **Push-Infra:** APNs direkt via Capacitor oder über einen Dienst? Bindet an die bestehende Inngest-Job-Landschaft an.
- **Android später?** Capacitor kann dasselbe Projekt für Android (`npx cap add android`) — Strategie hält, nur separater Store-Prozess.

## Parallelisierung — was VOR App-Fertigstellung sinnvoll ist (2026-05-29)

Grundsatz: **Risiko + Infrastruktur jetzt, Politur + Einreichung zuletzt.** Inerte Abstraktionen ohne Konsumenten/Verifizierbarkeit bringen nichts — nur bauen, was decoupled UND testbar ist.

**Lohnt sich jetzt (decoupled von Web-Feature-Stand):**
- **Capacitor-Scaffold + Auth-Smoke-Test (höchster Wert):** Da Mac+Xcode vorhanden sind, ist die #1-Unbekannte — funktioniert Login im Standalone-WebView? — *heute schon verifizierbar*. Scaffold gegen Staging-Domain, Simulator starten, Magic-Link + Apple-Sign-in durchspielen. Isoliert in eigenem Worktree/Branch, **kein Commit/Deploy**, damit der laufende Refactor nicht verschränkt wird.
- **Platform-Detection-Helper:** kleine, web-sichere Utility (`window.Capacitor`-Feature-Detect, ohne Hard-Dependency) als stabile Basis für späteres iOS-UI-Branching.
- **RevenueCat-Backend (WS-7):** **nur wenn Pricing/Plan-Modell final ist** — StoreKit-Produkte hängen an festen Preis-Tiers, späteres Ändern ist mühsam. Subscriptions-Tabelle wird vom laufenden Refactor aktuell nicht angefasst → kollisionsarm.
- **Accounts/Infra:** App-Store-Connect-App-Eintrag, Bundle-ID, RevenueCat-Account, APNs-Key (reine Einrichtung).

**Wartet bis App fertig:** Per-Screen-Politur, Plugin-Verdrahtung an noch nicht finalen Stellen, Einreichung/Review.

## App-Store-Connect-API-Key & Automatisierung

- Ein **App Store Connect API Key** (Issuer-ID + Key-ID + `.p8`) automatisiert via **fastlane**: App-Record anlegen, TestFlight-Builds verwalten, Upload, Metadaten — spart manuelles Klicken in App Store Connect.
- **Entfernt NICHT** den Build/Sign/Archive-Schritt — der braucht Xcode (ist hier lokal vorhanden).
- **Zeitpunkt:** erst in der TestFlight/Submission-Phase relevant; alle Jetzt-Aufgaben oben brauchen den Key nicht. Daher **nicht vorab übergeben**.
- **Sicherheit:** `.p8` ist ein mächtiges Secret. Nicht in den Chat pasten, nicht committen. In Vaultwarden ablegen, Rolle minimal scopen (App Manager statt Admin). Erst zum Upload-Schritt einbinden.
- Kein `output: "export"` / statischer Export — bricht Server Components/Actions.
- Keinen RN/Expo-Rewrite starten — verwirft die gesamte Web-Codebasis.
- **Nicht** „einen Teil in React Native" schreiben für die Abos — native IAP läuft bei Capacitor über ein Plugin, nicht über RN. RN und Capacitor mischt man nicht.
- Bearer-Token nicht „auf Verdacht" aktivieren — erst wenn der Cookie-Weg im realen WebView scheitert.
- Die ⚠️-Feature-Punkte nicht hart auf Plugins umbauen — Web-Pfad behalten, nur via `Capacitor.isNativePlatform()` abzweigen.
