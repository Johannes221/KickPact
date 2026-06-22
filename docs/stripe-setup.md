# Stripe-Setup — Preise & Price-IDs

**Source of Truth für Beträge:** [`lib/stripe/pricing.ts`](../lib/stripe/pricing.ts) (`PLANS[...].cycles[...].amountCents`), gespiegelt in [`docs/pricing.md`](pricing.md).
Aktuell (Rework 2026-06-15): Basic **5 / 35**, Pro **11 / 75**, Verein **29 / 199** € (monthly / season_end).

## Warum dieses Dokument existiert

Stripe-Preise sind **unveränderlich** — der Betrag eines `Price`-Objekts lässt sich nicht editieren. Bei einer Preisänderung muss man **neue** Price-Objekte anlegen und die `STRIPE_*_PRICE_ID`-Env-Vars darauf umstellen. Passiert das nur halb (Code geändert, Stripe nicht), zahlt der Kunde einen anderen Betrag als beworben.

> **Zahlungstest 2026-06-20:** Checkout buchte 19 € für Pro, `/preise` bewarb 11 € — die Coolify-Price-IDs zeigten nach dem Rework noch auf die alten Objekte. Genau diese Drift fängt jetzt der `--verify`-Lauf.

## Ablauf bei Preisänderung (oder Erst-Setup)

Pro Umgebung **getrennt** ausführen — Test und Live haben eigene Price-IDs:

### 1. Test (`sk_test_…`, liegt in `.env.local`)

```bash
npm run stripe:prices          # legt Produkte+Preise idempotent an, gibt 6 Env-Zeilen aus
```

Die 6 ausgegebenen `STRIPE_..._PRICE_ID=price_…`-Zeilen in `.env.local` übernehmen, dann:

```bash
npm run stripe:prices:verify   # prüft: Stripe-unit_amount === pricing.ts-amountCents
```

`✅ Alle 6 Preise stimmen…` = grün. Exit-Code 1 + `✗`-Zeile = Drift.

### 2. Live (`sk_live_…`, **nicht** in `.env.local`)

Schreiben in Live erfordert bewusstes `--live` (Guard gegen versehentliche Live-Writes):

```bash
STRIPE_SECRET_KEY=sk_live_…  npx tsx scripts/sync-stripe-prices.ts --live
STRIPE_SECRET_KEY=sk_live_…  npx tsx scripts/sync-stripe-prices.ts --verify
```

### 3. Coolify

Die 6 `STRIPE_*_PRICE_ID` im Coolify-Service (Production = Live-IDs, Staging = Test-IDs) setzen → Redeploy.
Danach denselben `--verify`-Lauf gegen den jeweiligen Key wiederholen, um die deploy-te Config zu bestätigen.

## Wie das Skript idempotent bleibt

- **Product** je Plan via `metadata.kickpact_plan` wiederverwendet.
- **Price** nur bei exaktem Match (Betrag + Intervall + Währung) wiederverwendet; ein Objekt mit altem Betrag wird **nie** recycelt, sondern ein neues angelegt. Alte Preise bleiben bestehen (laufende Abos brechen nicht) — sie werden nur nicht mehr referenziert.
- Beträge kommen ausschließlich aus `pricing.ts`. Kein Hardcode → Code und Stripe können nicht erneut auseinanderlaufen.

Der Webhook-Reverse-Lookup `priceIdToPlanCycle` (`lib/stripe/pricing.ts`) matcht rein über die Env-Var-Werte — sobald die 6 IDs gesetzt sind, funktioniert er ohne weitere Änderung.

## Cycle → Stripe-Intervall

| Cycle | Stripe `recurring.interval` |
|---|---|
| `monthly` | `month` |
| `season_end` | `year` (Saison-Pass; Jun/Jul pausiert der Inngest-Cron `pause-season-passes`) |
