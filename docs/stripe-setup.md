# Stripe Setup — KickPact-Abo

KickPact-Abo: monatliche Subscription pro Mannschaft (Basic 9 €, Pro 19 €)
oder pro Verein (Vereinslizenz 49 €). 30 Tage Trial. Stripe-Webhook syncronisiert
den Status in `subscriptions`-Tabelle.

Ohne Stripe-Keys läuft die App weiter — Login, Pledges, PDF-Rechnungen
funktionieren normal. Nur die Checkout-Buttons im Vereins-Dashboard sind disabled.

---

## Schritt 1: Stripe-Account anlegen

1. https://dashboard.stripe.com/register → Konto erstellen
2. Aktiviere Testmodus oben rechts während Setup

## Schritt 2: Produkte + Preise anlegen

Im Stripe Dashboard:

1. **Products → + Add Product**
2. Lege drei Produkte an:

| Produkt-Name | Preis | Recurring | Speichere als |
|---|---|---|---|
| KickPact Basic | 9,00 € | Monatlich | `STRIPE_BASIC_PRICE_ID` |
| KickPact Pro | 19,00 € | Monatlich | `STRIPE_PRO_PRICE_ID` |
| KickPact Vereinslizenz | 49,00 € | Monatlich | `STRIPE_VEREIN_PRICE_ID` |

Nach Erstellung: Price-ID kopieren (Format `price_…`).

## Schritt 3: API-Keys holen

1. **Developers → API keys**
2. **Secret key** → kopieren als `STRIPE_SECRET_KEY` (Format `sk_test_…` oder `sk_live_…`)
3. **Publishable key** brauchen wir nicht (Checkout läuft hosted)

## Schritt 4: Webhook einrichten

1. **Developers → Webhooks → + Add endpoint**
2. URL:
   - Staging: `https://kickpact.schartl.dev/api/stripe/webhook`
   - Production: `https://kickpact.com/api/stripe/webhook`
3. **Events to listen to** (mind. diese vier):
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
4. **Signing secret** anzeigen lassen → kopieren als `STRIPE_WEBHOOK_SECRET` (Format `whsec_…`)

## Schritt 5: Env-Vars setzen

In `.env.local` (lokal) bzw. Coolify-ENV (Staging/Production):

```
STRIPE_SECRET_KEY="sk_test_xxx"
STRIPE_WEBHOOK_SECRET="whsec_xxx"
STRIPE_BASIC_PRICE_ID="price_xxx"
STRIPE_PRO_PRICE_ID="price_xxx"
STRIPE_VEREIN_PRICE_ID="price_xxx"
```

Server-Restart. Checkout-Buttons auf `/verein/<slug>/abo` werden aktiv.

## Schritt 6: Lokal testen mit Stripe CLI

```bash
brew install stripe/stripe-cli/stripe
stripe login
stripe listen --forward-to localhost:3003/api/stripe/webhook
```

Output zeigt ein temporäres `whsec_…` — als `STRIPE_WEBHOOK_SECRET` in `.env.local`
setzen für lokale Tests. In Produktion das echte Secret aus Dashboard nutzen.

Trigger Test-Events:
```bash
stripe trigger customer.subscription.created
stripe trigger invoice.paid
```

## Was Claude für dich machen kann

- **Wenn du mir Secret-Key + Webhook-Secret + die 3 Price-IDs gibst**, packe
  ich sie in Coolify ENV + `.env.local` und teste den Checkout-Flow auf Staging.
- Du musst nur die Stripe-Produkte selbst anlegen (Dashboard), ich kann die
  Stripe-API leider nicht remote bedienen ohne deinen Key.

---

## Architektur

| Datei | Was |
|---|---|
| `lib/stripe/client.ts` | Singleton + isStripeConfigured() |
| `lib/stripe/pricing.ts` | Plan-Definition + Price-ID-Mapping |
| `lib/actions/subscriptions.ts` | Checkout-Session + Customer-Portal-Action |
| `app/api/stripe/webhook/route.ts` | Webhook-Handler mit Signature-Verifikation |
| `app/(verein)/verein/[slug]/abo/page.tsx` | Abo-Übersicht + Checkout-Buttons |
| Schema `subscriptions`, `team_licenses` | bereits aus Plan 1 vorhanden |

## Trial-Verhalten

- Subscription wird mit `trial_period_days: 30` in Stripe erstellt
- `subscriptions.status = trialing` bis Trial-Ende
- Webhook `customer.subscription.updated` syncronisiert wenn Stripe auf `active` wechselt
- Bei `invoice.payment_failed`: Status → `past_due` (Read-only-Mode kommt mit Plan 6)

## Bekannte Limitierungen

- **Vereinslizenz**: Aktuell ein flatfee 49 €/Monat. Logik die Team-Lizenzen
  unter Vereinslizenz "subsumiert" (parent_club_license_id) steht in der Spec
  §6.8, ist aber noch nicht implementiert.
- **Read-Only-Mode bei past_due** (Spec §6.8): noch nicht aktiv — Sponsoren
  sehen die Mannschaft auch dann, Charges werden weiter erzeugt. Späterer Fix.
- **Trial-Reminder-Mails** (Spec: 7d/3d/1d): noch kein Inngest-Cron dafür.
