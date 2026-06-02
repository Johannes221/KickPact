import { PLAN_CAPS } from "@/lib/stripe/pricing";

/**
 * Trial-End "Loss-Framing": Was verliert ein Verein, wenn er nach dem Pro-Trial
 * auf Basic wechselt (statt Pro zu buchen)?
 *
 * Reine Anzeige-Logik fürs Abo-Panel — verändert KEINE Daten. Die tatsächliche
 * "pause-statt-löschen"-Automatik beim echten Downgrade ist ein separater
 * Folgeschritt (braucht Migration + Pause-Flag).
 *
 * Pure (kein DB-/server-only-Import) → unit-testbar. Die DB-Aggregation lebt in
 * lib/db/queries/downgrade-impact.ts.
 */
export interface DowngradeImpact {
  /** Hat der Verein überhaupt schon Sponsoring-Daten? Steuert Empty-State vs Loss-Framing. */
  hasData: boolean;
  /** Aktive Sponsoren-Slots über alle Teams (Summe pro Team). */
  activeSponsors: number;
  /** Sponsoren, die auf Basic über dem 5er-Limit pro Team pausiert würden. */
  sponsorsOverCap: number;
  /** Pledge-Regeln, die auf Basic über dem 3er-Limit pro Sponsor pausiert würden. */
  rulesOverCap: number;
  /** Pro-Features, die Basic nicht hat (statische Liste, vgl. docs/pricing.md). */
  lostFeatures: string[];
}

export const BASIC_SPONSOR_CAP = PLAN_CAPS.basic.maxSponsorsPerTeam ?? 5;
export const BASIC_RULE_CAP = PLAN_CAPS.basic.maxPledgeRulesPerSponsor ?? 3;

/** Pro-only Features, die beim Wechsel auf Basic wegfallen (Headline-Liste). */
export const BASIC_LOST_FEATURES = [
  "Saison-Wetten",
  "Eigene Trigger-Texte",
  "Vereins-Logo auf der PDF-Rechnung",
  "Vereins-Mail-Absender",
  "Pledge-Discovery (öffentliches Profil)",
  "CSV/Excel-Export",
  "Saison-Recap"
] as const;

/**
 * Pure: aggregiert Roh-Zählungen zu Over-Cap-Zahlen. Cap-Werte aus PLAN_CAPS.basic.
 * Getrennt von der DB-Query, damit ohne DB testbar.
 */
export function computeImpactNumbers(input: {
  /** Aktive Sponsoren je Team. */
  perTeamSponsorCounts: number[];
  /** Aktive Pledge-Regeln je (Sponsor, Team)-Kombination. */
  perSponsorRuleCounts: number[];
}): { activeSponsors: number; sponsorsOverCap: number; rulesOverCap: number } {
  const activeSponsors = input.perTeamSponsorCounts.reduce((a, b) => a + b, 0);
  const sponsorsOverCap = input.perTeamSponsorCounts.reduce(
    (a, c) => a + Math.max(0, c - BASIC_SPONSOR_CAP),
    0
  );
  const rulesOverCap = input.perSponsorRuleCounts.reduce(
    (a, c) => a + Math.max(0, c - BASIC_RULE_CAP),
    0
  );
  return { activeSponsors, sponsorsOverCap, rulesOverCap };
}
