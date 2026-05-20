/**
 * Pricing-Tabelle synchron zur Landing — pro Plan eine Stripe-Price-ID + Metadata.
 *
 * Stripe-Setup:
 * - Produkt: "KickPact Basic" (recurring), 9 €/Monat → STRIPE_BASIC_PRICE_ID
 * - Produkt: "KickPact Pro" (recurring), 19 €/Monat → STRIPE_PRO_PRICE_ID
 * - Produkt: "KickPact Vereinslizenz" (recurring), 49 €/Monat → STRIPE_VEREIN_PRICE_ID
 *
 * Trial: 30 Tage (in Stripe Subscription oder via subscription_data.trial_period_days).
 */
export type PlanKey = "basic" | "pro" | "verein";

export interface PlanDefinition {
  key: PlanKey;
  label: string;
  amountCents: number;
  unit: "team" | "club";
  features: string[];
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
  basic: {
    key: "basic",
    label: "Mannschaft Basic",
    amountCents: 900,
    unit: "team",
    features: [
      "Eine Mannschaft, eigenständig verwaltet",
      "Bis zu 20 Sponsoren",
      "Alle Auto- + Manuelle Trigger",
      "Monatliche PDF-Rechnung",
      "30 Tage gratis"
    ]
  },
  pro: {
    key: "pro",
    label: "Mannschaft Pro",
    amountCents: 1900,
    unit: "team",
    features: [
      "Unlimited Sponsoren",
      "Mannschafts-Logo auf PDF",
      "Custom Trigger-Texte",
      "Saison-Wetten",
      "CSV-Export + Sponsor-Stats",
      "30 Tage gratis"
    ]
  },
  verein: {
    key: "verein",
    label: "Vereinslizenz",
    amountCents: 4900,
    unit: "club",
    features: [
      "Alle Mannschaften des Vereins",
      "Master-Admin zentral",
      "Pro-Features für jedes Team",
      "Konsolidierte Rechnung",
      "Übergreifende Sponsor-Übersicht"
    ]
  }
};

export function getStripePriceId(plan: PlanKey): string | null {
  const map: Record<PlanKey, string | undefined> = {
    basic: process.env.STRIPE_BASIC_PRICE_ID,
    pro: process.env.STRIPE_PRO_PRICE_ID,
    verein: process.env.STRIPE_VEREIN_PRICE_ID
  };
  return map[plan] ?? null;
}

export const TRIAL_DAYS = 30;
