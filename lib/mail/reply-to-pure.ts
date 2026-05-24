import type { PlanKey } from "@/lib/stripe/pricing";

export const KICKPACT_REPLY_TO = "noreply@kickpact.de";

const PLAN_RANK: Record<PlanKey, number> = {
  basic: 0,
  pro: 1,
  verein: 2
};

/**
 * Pure: gewinnt das höchste Tier aller übergebenen Plans (basic < pro < verein).
 */
export function highestPlanFrom(plans: PlanKey[]): PlanKey {
  if (plans.length === 0) return "basic";
  return plans.reduce(
    (best, p) => (PLAN_RANK[p] > PLAN_RANK[best] ? p : best),
    plans[0]
  );
}

/**
 * Pure: leitet die Reply-To-Adresse aus dem höchsten Plan + Vereins-Slug ab.
 *
 * - Basic → `noreply@kickpact.de`
 * - Pro / Vereinslizenz → `<slug>@kickpact.de` (KickPact-Alias, leitet auf den
 *   Vereins-Kontakt weiter). Wir nutzen bewusst nicht direkt die echte
 *   Vereins-Mail, damit alle Mails durch unseren Routing-Layer gehen.
 */
export function deriveReplyTo(plan: PlanKey, clubSlug: string): string {
  if (plan === "basic") return KICKPACT_REPLY_TO;
  return `${clubSlug}@kickpact.de`;
}
