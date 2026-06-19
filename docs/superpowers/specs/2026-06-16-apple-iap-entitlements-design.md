# Apple IAP + Entitlement-Gating (Pricing Part B) — Design

> **Status:** Design freigegeben 2026-06-16. Nächster Schritt: writing-plans.
> **Vorgänger:** Part A (Pricing-Rework, neue Preise Basic 5 / Pro 11 / Verein 29 €,
> Saison-Pass −42 %) — PR #13. Diese Spec baut darauf auf.
> **Branch:** `feat/apple-iap-entitlements`.

## 1. Ziel & Problem

KickPact verkauft Abos heute nur über **Stripe (Web)**. Sobald die iOS-App
(Capacitor) im App Store ist, **verlangt Apple**, dass digitale Abos über
**StoreKit In-App-Purchase** laufen — Stripe-Checkout in der iOS-WebView wäre
ein Review-Reject (Guideline 3.1.1) und Anti-Steering-Verstoß (3.1.3).

Daraus folgen vier Anforderungen, die zusammen gelöst werden müssen:

1. **Zwei Bezahlkanäle** — Stripe (Web) **und** Apple IAP (iOS) — die in
   **dieselbe** Entitlement-Wahrheit schreiben.
2. **Konsolidierung / kein Doppel-Abo** — ein Club zahlt entweder über Stripe
   *oder* über Apple, nie beides; die Kanäle beißen sich nicht.
3. **Feature-Gating korrekt für beide** — Pro/Verein ist eine bezahlte Lizenz;
   läuft sie ab (Trial vorbei, Refund, Kündigung), greifen überall dieselben
   Read-Only-/Cap-Regeln, egal über welchen Kanal bezahlt wurde.
4. **FOMO/Upgrade-UI** — wenn Funktionen wegfallen (Trial-Ende, Lapse) bzw. ein
   Cap erreicht wird, erscheint ein channel-korrekter Upgrade-Pfad
   (StoreKit-Sheet auf iOS, Stripe auf Web).

### Erfolgskriterien (verifizierbar)

- Apple-Kauf eines Clubs mit aktivem Stripe-Abo wird **abgelehnt** (und umgekehrt).
- Jeder relevante Apple-Notification-Typ mappt auf den korrekten internen
  `subscription_status`.
- Eine gefälschte/ungültige JWS-Signatur am Apple-Endpoint → **401**, kein DB-Write.
- `getCheckoutChannel()` liefert im iOS-Kontext **nie** `"stripe"`.
- Im iOS-Kontext sind Stripe-CTAs, Web-Preise und „günstiger online"-Hinweise
  **nicht im DOM**.
- Read-Only-Club: Schreib-Action wirft / zeigt Upgrade-Gate; Lese-Action
  funktioniert unverändert.
- UI-Versprechen („mit Pro bekommst du X") und tatsächliche Cap-Enforcement
  stammen aus **einer** Quelle (`FEATURE_BY_PLAN`) — kein Drift.

### Nicht-Ziel (bewusst Backlog)

- **Android/Google Play Billing** — die Native-App ist aktuell iOS-only
  (`KickPactApp`-UA = iOS). `provider`-Enum lässt `'google'` für später offen,
  aber kein Code dafür in dieser Iteration.
- **Migration bestehender Stripe-Abos auf Apple** (oder zurück) — ein Wechsel
  des Bezahlkanals ist v1 nicht vorgesehen; ein Club bleibt bei dem Kanal,
  über den er zuerst gekauft hat. Doku als bekannte Einschränkung.
- **Stripe-Go-Live selbst** (Live-Account, Live-Price-IDs) — getrenntes TODO
  in STATE.md, nicht Teil dieser Spec.

## 2. App-Store-Connect-Stand (bereits erledigt)

Per ASC-API angelegt (`scripts/create-asc-iap-products.mjs`, idempotent):

- App: `com.kickpact.app` (ASC-ID 6780505599)
- Subscription-Gruppe „KickPact Pläne" (ID 22159886) + de-DE-Localizations
- 6 Auto-Renewable-Subscriptions:

  | Plan | Cycle | Product ID | Apple-Periode | Zielpreis |
  |---|---|---|---|---|
  | Basic | monthly | `kickpact.basic.monthly` | 1 Monat | 4,99 € |
  | Basic | season | `kickpact.basic.season` | 1 Jahr | 34,99 € |
  | Pro | monthly | `kickpact.pro.monthly` | 1 Monat | 10,99 € |
  | Pro | season | `kickpact.pro.season` | 1 Jahr | 74,99 € |
  | Verein | monthly | `kickpact.verein.monthly` | 1 Monat | 28,99 € |
  | Verein | season | `kickpact.verein.season` | 1 Jahr | 199,99 € |

**Offen (manuell, einmalig):** Start-Preise im ASC-UI setzen — der
`POST /v1/subscriptionPrices`-Endpoint ist für die Erst-Preis-Anlage verbuggt
(409 „processing the pricing information", alle Varianten getestet). Script
`scripts/set-asc-iap-prices.mjs` bleibt als Vorlage für künftige
API-Preisänderungen.

> **Apple-Perioden-Anmerkung:** Saison-Pass ist fachlich 10 aktive Monate
> (Aug–Mai, Jun/Jul Pause). Apple kennt nur Standard-Perioden; wir bilden
> Saison auf `ONE_YEAR` ab. Die Sommerpause-Semantik (kein Charge Jun/Jul)
> existiert auf Apple-Seite **nicht** als echte Pause — der Jahres-Preis ist
> bereits der Paketpreis. Die interne `paused`-Logik (`SEASON_PAUSE_MONTHS`)
> bleibt eine reine **Stripe**-Mechanik; für Apple-Saison-Abos ist `paused`
> kein erreichbarer Zustand (das Jahr läuft durch, Verlängerung nach 12 Monaten).

## 3. Datenmodell (Migration 0060)

Drei Spalten auf `subscriptions` (siehe `lib/db/schema/billing.ts`):

```sql
ALTER TABLE subscriptions ADD COLUMN provider text;            -- 'stripe' | 'apple' (NULL = Trial/kein Abo)
ALTER TABLE subscriptions ADD COLUMN apple_original_transaction_id text UNIQUE;
ALTER TABLE subscriptions ADD COLUMN apple_expires_at timestamptz;
```

- **`provider`** — gesetzt beim ersten echten Kauf. Steuert die Kanal-Invariante.
  Solange `NULL`: Club ist im Trial oder unlizenziert, beide Kanäle offen.
- **`apple_original_transaction_id`** — Apples stabiler Abo-Identifier (bleibt
  über Renewals/Upgrades gleich). Pendant zu `stripeSubscriptionId`. `UNIQUE`
  verhindert, dass dieselbe Apple-Subscription zwei Clubs zugeordnet wird.
- **`apple_expires_at`** — Ablauf der aktuellen Apple-Periode (aus
  `getAllSubscriptionStatuses`). Pendant zu `currentPeriodEnd`.

Drizzle-Enum für `provider`:
```ts
export const billingProviderEnum = pgEnum("billing_provider", ["stripe", "apple", "google"]);
```
(`'google'` inert reserviert — kein Code, analog zum inerten `'annual'`-Cycle.)

**`gateFromSubscription()` / `getSubscriptionGate()` bleiben unverändert** — sie
lesen nur `status`, den beide Provider gleich beschreiben. Das ist der Kern der
Konsolidierung: ein Gate, zwei Schreiber.

## 4. Komponenten & Datenfluss

### 4.1 Kanal-Auswahl — `lib/billing/checkout-channel.ts` (neu)

```ts
export type CheckoutChannel = "stripe" | "apple";
export function getCheckoutChannel(): CheckoutChannel {
  return isIOSApp() ? "apple" : "stripe";   // aus lib/platform/native.ts
}
```
Eine einzige Funktion entscheidet überall, welcher Bezahlpfad + welche
Preis-Darstellung gilt. Client-seitig (`"use client"`), weil `isIOSApp()`
`window` braucht. Server-Pfade leiten den Kanal aus dem Native-UA ab
(`lib/platform/native-server.ts`, bereits vorhanden).

### 4.2 Client-Plugin — `IAPPlugin.swift` (neu, ~90 Zeilen StoreKit 2)

Capacitor-Plugin mit drei Methoden:
- `getProducts({ productIds })` → `Product[]` (Titel/Preis direkt von Apple,
  lokalisiert; **kein** hartkodierter Preis im JS für iOS)
- `purchase({ productId })` → `{ originalTransactionId, jwsRepresentation }`
- `restore()` → reaktiviert Entitlements aus `Transaction.currentEntitlements`

TS-Bridge `lib/platform/iap.ts` kapselt den Plugin-Aufruf web-inert (No-Op +
Throw „nur in App verfügbar" auf Web).

### 4.3 Sofort-Verifikation — `POST /api/apple/verify` (neu)

Nach erfolgreichem `purchase()` schickt der Client das JWS hierher:
1. JWS verifizieren (`@apple/app-store-server-library`, `SignedDataVerifier`).
2. Authoritative Re-Fetch via `AppStoreServerAPIClient.getAllSubscriptionStatuses(originalTransactionId)`.
3. Club aus Session ableiten (eingeloggter Admin), **Kanal-Invariante prüfen**
   (siehe 5), dann `syncSubscriptionForClub()` + `setTeamLicensesPlanForSubscription()`.

So ist die UI **sofort** aktuell, ohne auf die asynchrone Server-Notification
zu warten. Idempotent über `apple_original_transaction_id`.

### 4.4 Server-Notifications — `POST /api/apple/notifications` (neu)

Strukturgleich zum Stripe-Webhook (`app/api/stripe/webhook/route.ts`):

| Stripe-Webhook | Apple-Pendant |
|---|---|
| `stripe.webhooks.constructEvent` (HMAC) | `SignedDataVerifier.verifyAndDecodeNotification` (Apple Root CA Chain) |
| `hasStripeEventBeenProcessed` / `markStripeEventProcessed` | **dieselbe Dedup-Tabelle**, Key = `notificationUUID` |
| `stripe.subscriptions.retrieve` (authoritative) | `getAllSubscriptionStatuses()` (authoritative) |
| `clubMatchesCustomer` (M4) | Mapping über `apple_original_transaction_id` |
| `syncSubscriptionForClub` | **dieselbe Funktion** |

Apple liefert App Store Server Notifications V2 (signiertes JWS, ein
`notificationType` + `subtype`). Marker erst **nach** erfolgreichem Handling
(A4-Muster: Verlust-/Reorder-Schutz). Unbekannte Typen → 200 (kein Retry-Sturm).

### 4.5 Notification-Type → Status-Mapping

| Apple `notificationType` (+subtype) | interner `subscription_status` |
|---|---|
| `SUBSCRIBED`, `DID_RENEW`, `OFFER_REDEEMED` | `active` |
| `DID_CHANGE_RENEWAL_STATUS` (AUTO_RENEW_DISABLED) | bleibt `active` bis `apple_expires_at` |
| `DID_CHANGE_RENEWAL_PREF` (Up/Downgrade) | `active` + neuen Plan via Product-ID spiegeln |
| `DID_FAIL_TO_RENEW` (GRACE_PERIOD) | `past_due` |
| `EXPIRED`, `GRACE_PERIOD_EXPIRED` | `cancelled` |
| `REFUND`, `REVOKE` | `cancelled` + Read-Only sofort |

Product-ID → (plan, cycle) via neuer Helper `appleProductToPlanCycle()` in
`lib/stripe/pricing.ts` (Pendant zu `priceIdToPlanCycle`).

### 4.6 FOMO/Upgrade-UI — `<UpgradeGate>` (neu)

Eine Komponente, drei Trigger:
1. **Cap erreicht** — `PlanCapExceededError` (existiert) wird im UI gefangen →
   Sheet „6. Sponsor? Mit Pro unbegrenzt." + Feature-Liste + channel-korrekter CTA.
2. **Trial-Ende** — `gate.reason === "trial_expired"` oder
   `daysUntilReadOnly ≤ 3`: persistenter Countdown-Banner im Vereins-Layout.
3. **Read-Only** — `gate.isReadOnly`: App bleibt lesbar; Schreib-Buttons öffnen
   das Gate statt der Aktion. `assertClubWriteAccess` wirft bereits — UI fängt's.

CTA-Verzweigung über `getCheckoutChannel()`: iOS → `iap.purchase()`,
Web → `createCheckoutSession()`.

### 4.7 Feature-Matrix als Single Source — `FEATURE_BY_PLAN`

In `lib/billing/plan-features.ts` eine deklarative Map, die **sowohl** die
Gate-Texte („das bekommst du mit Pro") **als auch** die Cap-Enforcement speist.
Verhindert den klassischen Paywall-Bug: UI verspricht X, Enforcement erlaubt Y.
Die bestehenden `PLAN_CAPS` werden daraus abgeleitet (kein Doppel-Pflegen).

## 5. Die Kanal-Invariante (kein Doppel-Abo)

Zentrale Regel, an **zwei** Schreib-Stellen erzwungen:

- **Apple-Pfad** (`/api/apple/verify`): Wenn der Club bereits
  `provider='stripe'` mit aktivem Abo hat → Kauf ablehnen, Fehler an Client
  („Dieser Verein zahlt bereits über die Website. Bitte dort verwalten.").
  Sonst `provider='apple'` setzen.
- **Stripe-Pfad** (`createCheckoutSession` + Webhook): Wenn `provider='apple'`
  → Checkout gar nicht erst anbieten / Webhook-Sync mit `if (provider==='apple') break;`.

Da iOS via Anti-Steering **keinen** Stripe-Checkout zeigt und Web **kein**
StoreKit hat, ist der Normalfall sauber getrennt; die Guards sind das
Sicherheitsnetz gegen Edge-Cases (z.B. Club kauft erst Web, lädt dann App).

## 6. Sicherheit

- **JWS-Verifikation** gegen Apple Root CA (G3) — nie dem Payload trauen.
  Gefälschte Signatur → 401, kein Write. Test mit manipuliertem Token.
- **Bundle-ID + Environment prüfen** (Sandbox vs. Production) in der
  verifizierten Notification — verhindert Sandbox-Receipts gegen Production.
- **`apple_original_transaction_id UNIQUE`** — eine Apple-Subscription kann nie
  zwei Clubs entitlen.
- **Verify-Endpoint ist session-gated** — nur der eingeloggte Club-Admin kann
  einen Kauf seinem Club zuordnen (kein anonymer JWS-Upload für fremde Clubs).
- **Credentials**: ASC-API-Key (`AuthKey_VP65CLK9FZ.p8`, Key-ID `VP65CLK9FZ`,
  Issuer `c3a68526-…`) + App-Store-Server-Notification-Signing kommen als
  Coolify-Env (`APPLE_IAP_*`), nie ins Repo. Bundle-ID `com.kickpact.app`,
  Team-ID `A5SM7VJ6M2`.

## 7. Verifikation (TDD — rot zuerst)

Unit/Integration:
- Kanal-Invariante: Apple-Kauf bei aktivem Stripe → abgelehnt; Stripe-Checkout
  bei `provider='apple'` → abgelehnt.
- `appleProductToPlanCycle()`: alle 6 Product-IDs → korrekte (plan, cycle).
- Notification-Mapping: jeder Typ aus 4.5 → erwarteter Status.
- JWS-Verifikation: gültig → decode ok; manipuliert → Throw/401.
- Dedup: gleiche `notificationUUID` zweimal → zweiter Lauf No-Op.
- `getCheckoutChannel()`: iOS-UA → `apple`, Web → `stripe`.
- Read-Only: Schreib-Action wirft, Lese-Action nicht (bestehende Gate-Tests
  erweitern).
- `FEATURE_BY_PLAN` ↔ `PLAN_CAPS` Konsistenz: abgeleitete Caps == kanonische Caps.

Manuell (TestFlight, nach Implementierung):
- Sandbox-Kauf je Plan → Entitlement aktiv, korrekter Plan.
- `restore()` nach Neuinstallation.
- Refund (ASC Sandbox) → Read-Only.
- Anti-Steering visuell: keine Web-Preise/Stripe-CTAs in der App.

## 8. Abhängigkeiten / offene Eingaben von Johannes

- **Start-Preise im ASC-UI** setzen (6 Stück, siehe §2).
- **App-Store-Server-Notification-URL** in ASC eintragen (zeigt auf
  `/api/apple/notifications`, Production + Sandbox).
- **TestFlight-Build** mit dem neuen `IAPPlugin` für den manuellen Test.
- Bestätigung der **Apple-Preispunkte** (Apple zwingt `.99` — 4,99 statt 5,00
  etc.; Abweichung zu den Web-Preisen 5/11/29 ist gewollt & minimal).

## 9. Implementierungs-Reihenfolge (für writing-plans)

1. Migration 0060 + Schema + `provider`-Enum (rot: Schema-Test).
2. `appleProductToPlanCycle` + `FEATURE_BY_PLAN` (rein, gut testbar).
3. `getCheckoutChannel` + Anti-Steering-Ausblendung (Web bleibt grün).
4. JWS-Verify-Lib-Wrapper + `/api/apple/verify` (Sofort-Pfad).
5. `/api/apple/notifications` (Async-Netz) — spiegelt Stripe-Webhook.
6. Kanal-Invariante-Guards in beiden Pfaden.
7. `<UpgradeGate>` + 3 Trigger-Punkte.
8. Swift-`IAPPlugin` + TS-Bridge (zuletzt, braucht Xcode/Build).
