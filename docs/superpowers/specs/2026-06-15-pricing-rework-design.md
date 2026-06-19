# Pricing-Rework — Design

**Stand:** 2026-06-15 · Teil A von „Payment-Konsolidierung" (Teil B = Dual-Provider Stripe+Apple-IAP, eigene Spec)
**Source of Truth nach Umsetzung:** `lib/stripe/pricing.ts`, `docs/pricing.md`, `/preise`-Page

## Ziel

Preise senken, ohne Struktur oder Modell zu ändern. Treiber: aktuelle Preise (Pro 19 €, Verein 49 €) wirken zu teuer für den preissensiblen Amateurfußball-Markt; Ziel ist Adoption.

**Beibehalten:** 3 Tiers (Basic/Pro/Verein) × 2 Cycles (monthly/season_end), Fixpreis, **0 % Provision** auf Pledges, **30 Tage Trial** ab Saisonstart (bewusst **kein** Freemium — die 30 Tage sind der kostenlose Einstieg).

## Finale Preise

| Plan | Einheit | Monat | Saison-Pass | effektiv/Mon | sparen |
|---|---|---|---|---|---|
| **Basic** | Mannschaft | 5 € | 35 € | 3,50 € | 42 % |
| **Pro** | Mannschaft | 11 € | 75 € | 7,50 € | 43 % |
| **Vereinslizenz** | Verein | 29 € | 199 € | 19,90 € | 43 % |

- **Saison-Pass = ~3 Monate gratis** (Aug–Mai, 10 Monate Service; effektiv/Mon = Saisonpreis ÷ 10). Spar-% gegen 12× Monatspreis.
- **Vereinslizenz „lohnt ab 3 Mannschaften"** (Break-even-Bedingung):
  - 2 Teams: 2 × 11 = 22 € < 29 € → Pro günstiger (Verein lohnt noch nicht) ✓
  - 3 Teams: 3 × 11 = 33 € > 29 € → Vereinslizenz günstiger (lohnt sich) ✓
- **„< 1 €/Spieler"-Versprechen** trägt weiter: Pro 11 € ÷ 22 Mann = 0,50 € · Verein 29 € ÷ 50 Mann = 0,58 €.

### `amountCents` (für `lib/stripe/pricing.ts`)

| Plan | monthly | season_end |
|---|---|---|
| basic | 500 | 3500 |
| pro | 1100 | 7500 |
| verein | 2900 | 19900 |

## Scope

**In Scope (nur Web/Stripe):**
1. **`lib/stripe/pricing.ts`** — `amountCents`, `display`, `caption`, `saveBadge`, `note` und `CYCLE_SUBLABELS` auf die neuen Werte. Typen/Logik (`getMonthlyEquivalent`, `getSavings`, Reverse-Lookup) unverändert.
2. **`docs/pricing.md`** (Source of Truth) — Tabellen + Rationale (3-Mannschaften-Break-even, stärkerer Saison-Rabatt).
3. **`/preise`-Page** — zieht aus `pricing.ts`; Copy/Vergleichszeilen gegenchecken (statische Texte mit alten Zahlen?).
4. **Stripe-Sandbox** — 6 **neue** Price-Objekte mit den neuen Beträgen anlegen (Stripe-Preise sind immutable), dann die 6 Env-Vars `STRIPE_<PLAN>_<CYCLE>_PRICE_ID` auf die neuen IDs umhängen. Reverse-Lookup im Webhook (`priceIdToPlanCycle`) greift dann automatisch.
5. **Tests** — `tests/stripe/pricing.test.ts` (+ betroffene billing-cycle-Tests) auf neue Beträge/Prozente. TDD: erst Test auf neue Werte (rot), dann `pricing.ts` anpassen (grün).

**Out of Scope (→ Teil B):** iOS-/Apple-IAP-Preise (ggf. minimal höher wegen 15 % Apple-Cut), Entitlement-Reconciliation, Anti-Steering-Branching.

## Verifikation

- `npm test` (Vitest) komplett grün.
- Je Plan × Cycle ein realer **Stripe-Sandbox-Checkout** (Trial → Abo); Webhook spiegelt Plan+Cycle korrekt in die DB (`priceIdToPlanCycle`).
- `/preise` rendert die neuen Zahlen ohne Rest-Hardcodes.

## Risiken / Hinweise

- **Stripe-Preise sind unveränderlich** → es entstehen neue Price-IDs; bestehende Sandbox-Subscriptions behalten ihre alte Price-ID (für Live-Migration später relevant, in Sandbox egal).
- Etwaige **hartkodierte Preis-Zahlen** außerhalb von `pricing.ts` (Marketing-Copy, Onboarding-Wizard, Hilfe-Center-Artikel) müssen mitgezogen werden — vor Abschluss greppen.
