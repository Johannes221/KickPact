/**
 * Pricing-Tabelle synchron zu docs/pricing.md (Source of Truth) und /preise-Page.
 *
 * 3 Tiers (basic / pro / verein) × 3 Billing-Cycles (monthly / season / annual)
 * = 9 Stripe-Price-IDs.
 *
 * Stripe-Setup:
 * - Pro Plan + Billing-Cycle eine eigene Stripe-Price-ID, Env-Variable folgt
 *   dem Muster STRIPE_<PLAN>_<CYCLE>_PRICE_ID, z.B. STRIPE_PRO_SEASON_PRICE_ID.
 *
 * Trial: 30 Tage (in Stripe Subscription oder via subscription_data.trial_period_days).
 */
export type PlanKey = "basic" | "pro" | "verein";
export type BillingCycle = "monthly" | "season" | "annual";

export interface CyclePrice {
  /** Voll-Preis in Cent (z.B. 14900 = 149 €). */
  amountCents: number;
  /** Display-Anzeige: was groß steht. */
  display: string;
  /** Sub-Anzeige: kleinerer Kontext (z.B. effektiv pro Monat). */
  caption: string;
  /** Optionaler Spar-Badge ("~22 % sparen"). */
  saveBadge?: string;
}

export interface PlanDefinition {
  key: PlanKey;
  label: string;
  tagline: string;
  unit: "team" | "club";
  /** Pro Billing-Cycle ein Preis-Eintrag. */
  cycles: Record<BillingCycle, CyclePrice>;
  /** Highlight-Features für die Pricing-Card (5–6 Zeilen). */
  features: string[];
  /** Pro Tier optionale Sub-Notiz (z.B. "Unter 1 € pro Spieler"). */
  note?: string;
  cta: string;
}

export const PLANS: Record<PlanKey, PlanDefinition> = {
  basic: {
    key: "basic",
    label: "Basic",
    tagline: "Zum Reinkommen.",
    unit: "team",
    cycles: {
      monthly: {
        amountCents: 500,
        display: "5 €",
        caption: "/ Mannschaft / Monat"
      },
      season: {
        amountCents: 3900,
        display: "39 €",
        caption: "/ Saison · 3,90 €/Mon",
        saveBadge: "35 % sparen"
      },
      annual: {
        amountCents: 4900,
        display: "49 €",
        caption: "/ Jahr · ~4,08 €/Mon",
        saveBadge: "18 % sparen"
      }
    },
    features: [
      "Alle Auto-Trigger (10 Typen) + Manual-Trigger",
      "Bis zu 5 Sponsoren, 3 Pledge-Rules pro Sponsor",
      "Fußball.de-Crawler alle 6h",
      "Monatliche PDF-Rechnung",
      "Sponsor-Einladungslinks",
      "30 Tage gratis · 0 % Provision"
    ],
    cta: "Basic testen"
  },
  pro: {
    key: "pro",
    label: "Pro",
    tagline: "Sponsoring, das mitfiebert.",
    unit: "team",
    cycles: {
      monthly: {
        amountCents: 1900,
        display: "19 €",
        caption: "/ Mannschaft / Monat"
      },
      season: {
        amountCents: 14900,
        display: "149 €",
        caption: "/ Saison · 14,90 €/Mon",
        saveBadge: "35 % sparen"
      },
      annual: {
        amountCents: 18900,
        display: "189 €",
        caption: "/ Jahr · ~15,75 €/Mon",
        saveBadge: "17 % sparen"
      }
    },
    features: [
      "Alles aus Basic, plus:",
      "∞ Sponsoren · ∞ Pledge-Rules · ∞ Historie",
      "Saison-Wetten + Custom-Trigger-Texte",
      "Vereins-Logo auf PDF · Vereins-Mail-Absender",
      "Pledge-Discovery, Embed-Widget, Newsletter",
      "CSV-Export, Sponsor-Stats, Saison-Recap-PDF"
    ],
    note: "Bei 22-Mann-Kader: unter 1 € pro Spieler/Monat.",
    cta: "Pro auswählen"
  },
  verein: {
    key: "verein",
    label: "Vereinslizenz",
    tagline: "Der ganze Verein. Ein Tarif.",
    unit: "club",
    cycles: {
      monthly: {
        amountCents: 4900,
        display: "49 €",
        caption: "/ Verein / Monat"
      },
      season: {
        amountCents: 38900,
        display: "389 €",
        caption: "/ Saison · 38,90 €/Mon",
        saveBadge: "34 % sparen"
      },
      annual: {
        amountCents: 48900,
        display: "489 €",
        caption: "/ Jahr · ~40,75 €/Mon",
        saveBadge: "17 % sparen"
      }
    },
    features: [
      "Alles aus Pro, plus:",
      "∞ Mannschaften unter einer Lizenz",
      "Master-Admin-Cockpit + bis zu 10 Admins",
      "Konsolidierte Sammelrechnung",
      "Cross-Team-Sponsor-View",
      "Vereins-aggregiertes Saison-Recap"
    ],
    note: "Unter 1 € pro Spieler bei 50-Mann-Verein · ab 0,25 €/Spieler.",
    cta: "Verein anlegen"
  }
};

/** Geordnete Liste für UI-Iteration (Basic → Pro → Vereinslizenz). */
export const PLAN_ORDER: PlanKey[] = ["basic", "pro", "verein"];

/** Geordnete Liste für UI-Iteration (Monatlich → Saison-Pass → Annual). */
export const CYCLE_ORDER: BillingCycle[] = ["monthly", "season", "annual"];

export const CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: "Monatlich",
  season: "Saison-Pass",
  annual: "Annual"
};

export const CYCLE_SUBLABELS: Record<BillingCycle, string> = {
  monthly: "jederzeit kündbar",
  season: "Aug–Mai · 35 % sparen",
  annual: "12 Mon. · ~17 % sparen"
};

/** Default-Auswahl im Wizard und auf der Pricing-Page. */
export const DEFAULT_CYCLE: BillingCycle = "season";

export function getStripePriceId(
  plan: PlanKey,
  cycle: BillingCycle = "monthly"
): string | null {
  const envKey =
    `STRIPE_${plan.toUpperCase()}_${cycle.toUpperCase()}_PRICE_ID` as const;
  return process.env[envKey] ?? null;
}

/**
 * Reverse-Lookup von Stripe-Price-ID auf (plan, cycle).
 * Wird vom Webhook-Handler genutzt, um aus `subscription.items.data[0].price.id`
 * auf den gebuchten Plan + Cycle zu schliessen und in die DB zu spiegeln.
 */
export function priceIdToPlanCycle(
  priceId: string
): { plan: PlanKey; cycle: BillingCycle } | null {
  for (const plan of PLAN_ORDER) {
    for (const cycle of CYCLE_ORDER) {
      if (getStripePriceId(plan, cycle) === priceId) {
        return { plan, cycle };
      }
    }
  }
  return null;
}

/**
 * Effektive Monats-Belastung in Cent für eine (plan, cycle)-Kombination.
 *
 * - monthly: Preis 1:1
 * - season: Saison-Pass / 10 Monate (Aug–Mai, Jun/Jul pausiert)
 * - annual: Jahres-Preis / 12 Monate
 *
 * Werte gerundet auf ganze Cent.
 */
export function getMonthlyEquivalent(
  plan: PlanKey,
  cycle: BillingCycle
): number {
  const total = PLANS[plan].cycles[cycle].amountCents;
  if (cycle === "monthly") return total;
  if (cycle === "season") return Math.round(total / 10);
  return Math.round(total / 12);
}

/**
 * Ersparnis-Vergleich gegen "monthly × Vergleichsbasis".
 *
 * - season: 10 × monthly als Vergleichsbasis (Aug–Mai aktive Monate)
 * - annual: 12 × monthly als Vergleichsbasis
 * - monthly: keine Ersparnis (0/0)
 */
export function getSavings(
  plan: PlanKey,
  cycle: BillingCycle
): { absoluteCents: number; percent: number } {
  if (cycle === "monthly") return { absoluteCents: 0, percent: 0 };
  const monthly = PLANS[plan].cycles.monthly.amountCents;
  const total = PLANS[plan].cycles[cycle].amountCents;
  const baseline = monthly * (cycle === "season" ? 10 : 12);
  const absoluteCents = baseline - total;
  const percent = baseline > 0 ? Math.round((absoluteCents / baseline) * 100) : 0;
  return { absoluteCents, percent };
}

export const TRIAL_DAYS = 30;

/**
 * Monate, in denen Saison-Pass-Subscriptions pausiert sind (Sommerpause).
 * Inngest-Cron `pause-season-passes` triggert am 1. dieser Monate.
 */
export const SEASON_PAUSE_MONTHS = [6, 7] as const;

/**
 * Tier-Caps für Basic (Pro/Verein sind uncapped).
 *
 * - basic: max. 5 aktive Sponsoren pro Team, max. 3 Pledge-Rules pro Sponsor.
 * - pro / verein: `null` = unlimited.
 *
 * Wird von `lib/billing/plan-features.ts` zur Server-Action-Validierung benutzt.
 */
export const PLAN_CAPS: Record<
  PlanKey,
  {
    maxSponsorsPerTeam: number | null;
    maxPledgeRulesPerSponsor: number | null;
  }
> = {
  basic: { maxSponsorsPerTeam: 5, maxPledgeRulesPerSponsor: 3 },
  pro: { maxSponsorsPerTeam: null, maxPledgeRulesPerSponsor: null },
  verein: { maxSponsorsPerTeam: null, maxPledgeRulesPerSponsor: null }
} as const;
