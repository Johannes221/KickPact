import { PLAN_CAPS, type PlanKey } from "@/lib/stripe/pricing";

export interface PlanFeatureDef {
  /** Cap: null = unlimited. Speist die Enforcement (PLAN_CAPS ist die Quelle). */
  maxSponsorsPerTeam: number | null;
  maxPledgeRulesPerSponsor: number | null;
  /** UI: Überschrift im Upgrade-Sheet, wenn man auf DIESEN Plan upgraden würde. */
  upgradeHeadline: string;
  /** UI: Bullet-Liste, was dieser Plan freischaltet. */
  highlights: string[];
}

/**
 * Part B — Single Source für Feature-Gating: speist SOWOHL die UI-Texte im
 * <UpgradeGate> ALS AUCH (über PLAN_CAPS) die Cap-Enforcement. Die Cap-Felder
 * werden aus PLAN_CAPS (lib/stripe/pricing.ts) gezogen — kein Doppel-Pflegen,
 * kein Drift zwischen UI-Versprechen und Realität.
 *
 * KEIN "server-only": Diese Datei wird auch von der Client-Komponente
 * <UpgradeGate> (components/billing/upgrade-gate.tsx) importiert. Die
 * Cap-Enforcement-Logik liegt weiterhin im server-only `plan-features.ts`.
 */
export const FEATURE_BY_PLAN: Record<PlanKey, PlanFeatureDef> = {
  basic: {
    maxSponsorsPerTeam: PLAN_CAPS.basic.maxSponsorsPerTeam,
    maxPledgeRulesPerSponsor: PLAN_CAPS.basic.maxPledgeRulesPerSponsor,
    upgradeHeadline: "Mehr Sponsoren? Mit Pro unbegrenzt.",
    highlights: [
      "Bis zu 5 Sponsoren, 3 Regeln pro Sponsor",
      "Alle Auto-Trigger + Manual-Trigger"
    ]
  },
  pro: {
    maxSponsorsPerTeam: PLAN_CAPS.pro.maxSponsorsPerTeam,
    maxPledgeRulesPerSponsor: PLAN_CAPS.pro.maxPledgeRulesPerSponsor,
    upgradeHeadline: "Sponsoring, das mitfiebert — ohne Limits.",
    highlights: [
      "∞ Sponsoren · ∞ Regeln · ∞ Historie",
      "Saison-Ziele, Custom-Trigger-Texte, Embed-Widget",
      "Vereins-Logo auf PDF, CSV-Export, Saison-Recap"
    ]
  },
  verein: {
    maxSponsorsPerTeam: PLAN_CAPS.verein.maxSponsorsPerTeam,
    maxPledgeRulesPerSponsor: PLAN_CAPS.verein.maxPledgeRulesPerSponsor,
    upgradeHeadline: "Der ganze Verein. Ein Tarif.",
    highlights: [
      "∞ Mannschaften unter einer Lizenz",
      "Master-Admin-Cockpit + bis zu 10 Admins",
      "Konsolidierte Sammelrechnung, Cross-Team-View"
    ]
  }
};
