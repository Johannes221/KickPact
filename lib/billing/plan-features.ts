import "server-only";
import {
  countActiveSponsorsForTeam,
  countPledgeRulesForSponsorOnTeam,
  getTeamLicensePlan
} from "@/lib/db/queries/pledges";
import { PLAN_CAPS, type PlanKey } from "@/lib/stripe/pricing";

/**
 * Cap-Verstoss bei Pledge-/Rule-Anlage. Server-Actions werfen das,
 * Route-Handler konvertieren in 400 mit `error: "plan_cap_exceeded"`.
 */
export class PlanCapExceededError extends Error {
  constructor(
    public cap: "sponsors" | "pledge_rules",
    public limit: number,
    public current: number,
    public plan: PlanKey
  ) {
    super(`Plan cap exceeded: ${cap} (${current}/${limit}) auf ${plan}-Tier.`);
    this.name = "PlanCapExceededError";
  }
}

// ---------- Pure helpers (kein DB-Import) ----------

/**
 * Pure: prüft, ob ein zusätzlicher Sponsor auf einem Team mit `currentSponsors`
 * Sponsoren unter `plan` erlaubt ist.
 */
export function canAddSponsorOnPlan(
  plan: PlanKey,
  currentSponsors: number
): boolean {
  const cap = PLAN_CAPS[plan].maxSponsorsPerTeam;
  if (cap === null) return true;
  return currentSponsors < cap;
}

/**
 * Pure: prüft, ob eine zusätzliche Pledge-Rule für einen Sponsor unter `plan` erlaubt ist.
 */
export function canAddPledgeRuleOnPlan(
  plan: PlanKey,
  currentRules: number
): boolean {
  const cap = PLAN_CAPS[plan].maxPledgeRulesPerSponsor;
  if (cap === null) return true;
  return currentRules < cap;
}

// ---------- DB-Wrapper für Server-Actions ----------

/**
 * Wirft `PlanCapExceededError`, wenn das Team-Plan-Limit für Sponsoren erreicht ist
 * UND der Sponsor noch nicht auf dem Team aktiv ist (bestehende Sponsoren
 * dürfen weitere Pledges anlegen).
 */
export async function assertCanAddSponsorToTeam(
  teamId: string,
  sponsorId: string
): Promise<void> {
  const plan = await getTeamLicensePlan(teamId);
  const cap = PLAN_CAPS[plan].maxSponsorsPerTeam;
  if (cap === null) return;

  // Wenn dieser Sponsor schon aktiv ist, zählt er nicht doppelt.
  const existingRules = await countPledgeRulesForSponsorOnTeam(sponsorId, teamId);
  if (existingRules > 0) return;

  const current = await countActiveSponsorsForTeam(teamId);
  if (current >= cap) {
    throw new PlanCapExceededError("sponsors", cap, current, plan);
  }
}

/**
 * Wirft `PlanCapExceededError`, wenn die Pledge-Rule-Cap für diesen Sponsor
 * auf diesem Team erreicht ist.
 */
export async function assertCanAddPledgeRule(
  sponsorId: string,
  teamId: string
): Promise<void> {
  const plan = await getTeamLicensePlan(teamId);
  const cap = PLAN_CAPS[plan].maxPledgeRulesPerSponsor;
  if (cap === null) return;

  const current = await countPledgeRulesForSponsorOnTeam(sponsorId, teamId);
  if (current >= cap) {
    throw new PlanCapExceededError("pledge_rules", cap, current, plan);
  }
}
