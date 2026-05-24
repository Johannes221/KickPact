# Stripe Setup für KickPact — Beta-Launch Playbook

Schritt-für-Schritt-Anleitung für den Stripe-Account, der KickPact-Subscriptions
abrechnet. Ziel: nach diesem Dokument ist deine Stripe-Integration komplett
konfiguriert — 9 Price-IDs in der `.env.local`, Webhook angebunden, Test-Checkout
durchgespielt.

> **Wichtig:** KickPact läuft auch ohne Stripe (Login, Pledges, PDF-Rechnungen
> funktionieren). Nur die Checkout-Buttons im Vereins-Dashboard sind dann disabled.
> Du kannst diesen Setup also nachträglich machen, sobald du echtes Geld einsammeln willst.

---

## 1. Stripe-Account erstellen

1. Öffne <https://dashboard.stripe.com/register>.
2. E-Mail, Land (Deutschland), Passwort → "Konto erstellen".
3. Bestätigungs-Mail von Stripe öffnen und Link klicken.
4. Nach Login: **Account-Aktivierung** kannst du erstmal überspringen — für
   den Test-Mode (Schritt 2) brauchst du noch keine Bankdaten / Steuer-ID.

## 2. Test-Mode vs Live-Mode

Oben rechts im Stripe-Dashboard ist ein Toggle **"Testmodus"**:

- **ON** (orange-Badge "Test data"): kein echtes Geld, Test-Karten (Schritt 6)
  funktionieren. Alle Produkte/Preise/Webhooks die du hier anlegst sind
  Test-Daten und existieren *nicht* im Live-Mode.
- **OFF** (Live-Mode): echtes Geld. Eigene Produkte/Preise/Webhooks, eigene
  API-Keys (`sk_live_…` statt `sk_test_…`).

**Workflow für KickPact:**
1. Alles in Schritt 3–6 zuerst im **Test-Mode** durchspielen (auch lokal mit `npm run dev`).
2. Erst wenn der komplette Flow (Checkout → Webhook → DB-Sync) sauber läuft:
   Toggle umschalten und Schritte 3–5 *nochmal* im Live-Mode wiederholen.
3. Live-Keys und Live-Price-IDs gehen in Coolify-ENV (Production), nicht in
   `.env.local`.

## 3. 9 Produkte + 9 Preise anlegen

KickPact hat **3 Tiers** × **3 Billing-Cycles** = **9 Stripe-Price-IDs**.
Source of Truth: [`lib/stripe/pricing.ts`](../../lib/stripe/pricing.ts) `PLANS`-Konstante.

Lege im Stripe-Dashboard unter **Products → + Add product** die folgenden
drei Produkte an. Pro Produkt fügst du **3 Preise** hinzu (über "+ Add another price"
beim Anlegen, oder nachträglich über das Produkt-Detail-Sheet).

### Produkt 1: KickPact Basic

- **Name:** `KickPact Basic`
- **Description:** "Performance-Sponsoring für Amateurmannschaften — Einstiegs-Tarif. Pro Mannschaft."
- **Tax behavior:** "Inclusive" (Brutto-Preise, Stripe rechnet MwSt heraus).

| Preis-Name (intern) | Betrag | Currency | Billing | Recurring config | Env-Variable |
|---|---|---|---|---|---|
| Basic — Monthly | `5,00` | EUR | Recurring | `interval=month`, `interval_count=1` | `STRIPE_BASIC_MONTHLY_PRICE_ID` |
| Basic — Season-Pass | `39,00` | EUR | Recurring | `interval=month`, `interval_count=10` | `STRIPE_BASIC_SEASON_PRICE_ID` |
| Basic — Annual | `49,00` | EUR | Recurring | `interval=year`, `interval_count=1` | `STRIPE_BASIC_ANNUAL_PRICE_ID` |

### Produkt 2: KickPact Pro

- **Name:** `KickPact Pro`
- **Description:** "Sponsoring, das mitfiebert. ∞ Sponsoren, Custom-Trigger, Saison-Wetten. Pro Mannschaft."

| Preis-Name (intern) | Betrag | Currency | Billing | Recurring config | Env-Variable |
|---|---|---|---|---|---|
| Pro — Monthly | `19,00` | EUR | Recurring | `interval=month`, `interval_count=1` | `STRIPE_PRO_MONTHLY_PRICE_ID` |
| Pro — Season-Pass | `149,00` | EUR | Recurring | `interval=month`, `interval_count=10` | `STRIPE_PRO_SEASON_PRICE_ID` |
| Pro — Annual | `189,00` | EUR | Recurring | `interval=year`, `interval_count=1` | `STRIPE_PRO_ANNUAL_PRICE_ID` |

### Produkt 3: KickPact Vereinslizenz

- **Name:** `KickPact Vereinslizenz`
- **Description:** "Der ganze Verein, ein Tarif. ∞ Mannschaften, Master-Cockpit. Pro Verein."

| Preis-Name (intern) | Betrag | Currency | Billing | Recurring config | Env-Variable |
|---|---|---|---|---|---|
| Vereinslizenz — Monthly | `49,00` | EUR | Recurring | `interval=month`, `interval_count=1` | `STRIPE_VEREIN_MONTHLY_PRICE_ID` |
| Vereinslizenz — Season-Pass | `389,00` | EUR | Recurring | `interval=month`, `interval_count=10` | `STRIPE_VEREIN_SEASON_PRICE_ID` |
| Vereinslizenz — Annual | `489,00` | EUR | Recurring | `interval=year`, `interval_count=1` | `STRIPE_VEREIN_ANNUAL_PRICE_ID` |

### Hinweise zu den Recurring-Einstellungen

- **Monthly**: Standard. "Monatlich, jeden Monat" — `interval=month, interval_count=1`.
- **Season-Pass**: "Alle 10 Monate" — `interval=month, interval_count=10`. Decken
  Aug–Mai ab. Juni/Juli pausiert die App lokal (siehe `SEASON_PAUSE_MONTHS` in `pricing.ts`),
  Stripe weiß davon nichts — wir buchen einfach für 10 Monate vor, der nächste
  Charge kommt automatisch im August.
- **Annual**: "Jährlich" — `interval=year, interval_count=1`. Stripe-UI schreibt
  oft "Yearly", das ist dasselbe.
- **Trial-Periode** wird *nicht* im Preis-Setup definiert. KickPact setzt
  `trial_period_days: 30` dynamisch bei `createCheckoutSession()`.

### Beim Anlegen jeder Price-ID notieren

Nach "Create price" zeigt Stripe die ID im Format `price_1QabcXYZ…`.
**Kopier sie sofort** — auf der Produkt-Detail-Seite sind sie sonst nur durch
Klick auf die einzelne Zeile erreichbar.

## 4. Price-IDs in `.env.local` setzen

Trag alle 9 Werte in `.env.local` ein (für Production: Coolify-ENV):

```bash
# Stripe-Auth (Schritt 5)
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Basic
STRIPE_BASIC_MONTHLY_PRICE_ID="price_..."
STRIPE_BASIC_SEASON_PRICE_ID="price_..."
STRIPE_BASIC_ANNUAL_PRICE_ID="price_..."

# Pro
STRIPE_PRO_MONTHLY_PRICE_ID="price_..."
STRIPE_PRO_SEASON_PRICE_ID="price_..."
STRIPE_PRO_ANNUAL_PRICE_ID="price_..."

# Vereinslizenz
STRIPE_VEREIN_MONTHLY_PRICE_ID="price_..."
STRIPE_VEREIN_SEASON_PRICE_ID="price_..."
STRIPE_VEREIN_ANNUAL_PRICE_ID="price_..."
```

Naming-Convention `STRIPE_<PLAN>_<CYCLE>_PRICE_ID` ist exakt das was
[`getStripePriceId(plan, cycle)`](../../lib/stripe/pricing.ts) erwartet — also
keine Tippfehler.

Nach Speichern: `npm run dev` neu starten, damit Next.js die neuen ENV-Vars sieht.

## 5. API-Key + Webhook konfigurieren

### API-Key

1. **Developers → API keys** im Stripe-Dashboard.
2. **Secret key** → "Reveal test key" → kopieren als `STRIPE_SECRET_KEY`
   (`sk_test_…` im Test-Mode, `sk_live_…` im Live-Mode).
3. *Publishable key* brauchst du nicht — KickPact nutzt Hosted Checkout.

### Webhook-Endpoint

1. **Developers → Webhooks → + Add endpoint**.
2. **Endpoint URL:**
   - Lokal (Schritt 6, Stripe-CLI): nichts hier eintragen, CLI macht's.
   - Staging: `https://kickpact.schartl.dev/api/stripe/webhook`
   - Production: `https://app.kickpact.de/api/stripe/webhook`
3. **Events to send** (mind. diese fünf):
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Nach "Add endpoint": **Signing secret** auf der Detail-Seite anzeigen lassen
   ("Reveal") → als `STRIPE_WEBHOOK_SECRET` (Format `whsec_…`).

## 6. Test-Karten für QA

Stripe-Test-Mode akzeptiert nur **Test-Karten**. Wichtigste:

| Karte | PAN | Verhalten |
|---|---|---|
| Success (Standard) | `4242 4242 4242 4242` | Charge geht durch, Subscription wird `active` |
| 3D-Secure erforderlich | `4000 0027 6000 3184` | Stripe zeigt 3DS-Prompt |
| Decline (Insufficient funds) | `4000 0000 0000 9995` | Charge fehlschlägt mit `card_declined` |
| Decline beim ersten Charge nach Trial | `4000 0000 0000 0341` | Trial läuft, aber erste Live-Charge schlägt fehl |

CVC: beliebige 3 Ziffern. Expiry: beliebiges Datum in der Zukunft.
ZIP: beliebige 5 Ziffern (z.B. `69221`).

Komplette Liste:
<https://stripe.com/docs/testing#cards> (Cards by scenario).

### Webhook lokal testen (Stripe-CLI)

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Output zeigt ein temporäres `whsec_…` — **dieses** in `.env.local` setzen für
lokale Tests (nicht das Dashboard-Secret, das gilt nur für deployed URLs).

Trigger manuell Test-Events:

```bash
stripe trigger customer.subscription.created
stripe trigger invoice.paid
stripe trigger invoice.payment_failed
```

## 7. Live-Mode-Checklist (vor Production-Launch)

Bevor du den Live-Mode aktivierst, durchgeh diese 10 Punkte:

- [ ] **Stripe-Account aktiviert**: Bankdaten + Steuer-ID hinterlegt, Adresse
      bestätigt. Bis dahin kann Stripe Auszahlungen blockieren.
- [ ] **Live-Toggle umgelegt**, alle 9 Produkte/Preise im Live-Mode neu angelegt
      (Test-Mode-IDs funktionieren *nicht* live).
- [ ] **Live-Secret-Key** (`sk_live_…`) in Coolify-ENV als `STRIPE_SECRET_KEY` —
      nicht in `.env.local` committen!
- [ ] **Live-Price-IDs** (alle 9) in Coolify-ENV gesetzt, App neu deployed.
- [ ] **Live-Webhook** angelegt mit Production-URL, Signing-Secret als
      `STRIPE_WEBHOOK_SECRET` in Coolify.
- [ ] **Webhook-Test** im Stripe-Dashboard ausgeführt ("Send test webhook") →
      `2xx` Response von KickPact verifiziert.
- [ ] **Trial-Mail** verifiziert: 30-Tage-Trial wird in `subscriptions.trialEndsAt`
      korrekt gesetzt, Trial-Reminder-Cron läuft (Inngest-Dashboard).
- [ ] **Customer-Portal** in Stripe aktiviert (**Settings → Billing → Customer portal**),
      damit User Subscriptions selbst kündigen/upgraden können.
- [ ] **Statement-Descriptor** auf `KICKPACT` setzen (**Settings → Public details**),
      sonst sehen Karteninhaber kryptische "STRIPE\*…".
- [ ] **Echter Test-Checkout** mit einer eigenen Karte (kleinster Plan = Basic
      Monthly 5 €), danach im Stripe-Dashboard Refund auslösen.

## Was Claude für dich machen kann

- Wenn du mir die 9 Live-Price-IDs + Secret-Key + Webhook-Secret in einer Datei
  rüberreichst (z.B. `/tmp/stripe-live.env`), packe ich sie in die Coolify-ENV
  und teste den Checkout-Flow auf Staging.
- Die Stripe-Produkte selbst musst du im Dashboard anlegen — die Stripe-API
  kann ich nicht remote bedienen ohne deinen Key.

---

## Architektur (Referenz)

| Datei | Was |
|---|---|
| [`lib/stripe/client.ts`](../../lib/stripe/client.ts) | Singleton + `isStripeConfigured()` |
| [`lib/stripe/pricing.ts`](../../lib/stripe/pricing.ts) | `PLANS`-Konstante + `getStripePriceId()` |
| [`lib/actions/subscriptions.ts`](../../lib/actions/subscriptions.ts) | `createCheckoutSession` + Customer-Portal |
| [`app/api/stripe/webhook/route.ts`](../../app/api/stripe/webhook/route.ts) | Webhook-Handler mit Signature-Verify |
| [`app/(verein)/verein/[slug]/abo/page.tsx`](../../app/(verein)/verein/[slug]/abo/page.tsx) | Abo-Übersicht + Checkout-Buttons |
| Schema [`subscriptions`, `team_licenses`](../../lib/db/schema/billing.ts) | DB-Tabellen |

## Bekannte Limitierungen

- **Vereinslizenz-Bündelung**: Logik die Team-Lizenzen unter Vereinslizenz subsumiert
  (`parent_club_license_id`) ist im Schema vorhanden, aber noch nicht in der UI.
- **Read-Only-Mode bei `past_due`** (Spec §6.8): noch nicht aktiv — Sponsoren
  sehen die Mannschaft auch dann, Charges werden weiter erzeugt.
- **Trial-Reminder-Mails** (7d/3d/1d vor Trial-Ende): existieren als Inngest-Cron,
  aber Templates müssen vor Live-Launch QA-geprüft werden.
