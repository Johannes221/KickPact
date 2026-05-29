# Capacitor / iOS-App — Vorbereitungs- & Rollout-Plan

**Datum:** 2026-05-29
**Status:** Groundwork umgesetzt (web-inert). Eigentliche Capacitor-Integration **zurückgestellt** bis die Web-App „einigermaßen fertig" ist (Nutzer-Entscheidung).
**Ziel:** KickPact als iOS-App auf TestFlight → App Store, mit minimalem Aufwand und ohne UI-Rewrite.

## Strategie-Entscheidung (gebacken)

**Capacitor-WebView-Wrapper**, kein React-Native/Expo-Rewrite, kein natives Swift.

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
2. **Mac mit Xcode** — zum Bauen/Signieren des iOS-Targets (lokal oder CI wie Codemagic/EAS-Build-equivalent). Capacitor erzeugt ein natives Xcode-Projekt.
3. **App-Bundle-ID** festlegen, z.B. `com.kickpact.app`. Muss zur `APPLE_BUNDLE_ID`-ENV passen (Apple-Sign-in ist in [lib/auth/server.ts:26](../../../lib/auth/server.ts) schon darauf vorbereitet).
4. **Apple Sign-in ist Pflicht**, sobald Google-Login angeboten wird (Guideline 4.8). Ist bereits konfiguriert — nur Keys/Provider live schalten.

## Workstreams (wenn die App „fertig" ist)

| WS | Was | Hängt ab von | Risiko |
|---|---|---|---|
| **0** Groundwork (viewport/safe-area) | ✓ erledigt 2026-05-29 | — | — |
| **1** Capacitor-Scaffold | `@capacitor/core`+`/cli`+`/ios`, `capacitor.config.ts`, `npx cap add ios` | 0 | niedrig |
| **2** Server-URL-Strategie (WebView lädt remote) | Config auf Prod-URL zeigen, Cookie/CORS klären | 1 | **mittel** |
| **3** Auth im WebView (Bearer-Token) | better-auth Bearer-Plugin + Secure-Storage | 2 | **mittel-hoch** |
| **4** Native Mindestausstattung (4.2-Mitigation) | Push, Splash, Icon, Statusbar | 1 | mittel (Review) |
| **5** Build + TestFlight-Pipeline | Signing, Archive, Upload | 1–4 | niedrig |
| **6** Feature-Plugins (PDF/CSV/Clipboard/Upload) | je 1 Capacitor-Plugin, siehe Funktions-Audit | 1 | niedrig |
| **7** Abo Dual-Provider (Stripe Web **+** Apple IAP) | IAP-Plugin + Entitlement-Reconciliation, siehe eigener Abschnitt | 2 | **hoch** |

### WS-1 — Capacitor-Scaffold
```
npm i @capacitor/core @capacitor/ios
npm i -D @capacitor/cli
npx cap init KickPact com.kickpact.app
npx cap add ios
```
`capacitor.config.ts` → `server.url` auf die Prod-Domain (siehe WS-2). **Nicht** `webDir` mit statischem Export — die App braucht den laufenden Next-Server (Server Components/Actions). Der WebView lädt die echte Seite remote; Capacitor ist nur die native Hülle + Bridge zu nativen Plugins.

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

### Offene Sub-Entscheidung: Source-of-Truth
- **Empfohlen — RevenueCat:** abstrahiert StoreKit + App-Store-Notifications, liefert eine einheitliche Entitlement-API und kann **auch Stripe einlesen** → ein einziger „ist-aktiv"-Check für beide Provider. Zusatzsystem + Kosten ab Umsatzschwelle, spart aber den größten Teil der Reconciliation-Arbeit.
- **Self-built:** eigener Apple-Webhook + eigene Abgleichslogik in `subscriptions`. Keine Drittkosten, deutlich mehr Eigen-Code und Fehlerquellen (Renewals, Grace-Period, Refunds, Sandbox-vs-Prod).
→ Zu entscheiden vor WS-7. Tendenz RevenueCat wegen Dual-Provider-Komplexität.

### UI-Verzweigung
- iOS-Kontext (`Capacitor.isNativePlatform()`): Kauf-Flow zeigt **StoreKit-Produkte**, nicht den Stripe-Button. Keine Web-Preis-Hinweise (Anti-Steering).
- Web-Kontext: unverändert Stripe-Checkout.
- Verwaltung/Kündigen: im iOS-Abo über Apples Abo-Verwaltung; bei Stripe-Abos über das bestehende Customer-Portal.
- **Online-only akzeptabel?** Variante A heißt: ohne Netz keine App. Für eine Sponsoring-/Abrechnungs-App vermutlich ok.
- **Push-Infra:** APNs direkt via Capacitor oder über einen Dienst? Bindet an die bestehende Inngest-Job-Landschaft an.
- **Android später?** Capacitor kann dasselbe Projekt für Android (`npx cap add android`) — Strategie hält, nur separater Store-Prozess.

## Was NICHT zu tun ist
- Kein `output: "export"` / statischer Export — bricht Server Components/Actions.
- Keinen RN/Expo-Rewrite starten — verwirft die gesamte Web-Codebasis.
- **Nicht** „einen Teil in React Native" schreiben für die Abos — native IAP läuft bei Capacitor über ein Plugin, nicht über RN. RN und Capacitor mischt man nicht.
- Bearer-Token nicht „auf Verdacht" aktivieren — erst wenn der Cookie-Weg im realen WebView scheitert.
- Die ⚠️-Feature-Punkte nicht hart auf Plugins umbauen — Web-Pfad behalten, nur via `Capacitor.isNativePlatform()` abzweigen.
