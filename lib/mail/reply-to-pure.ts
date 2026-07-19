import type { PlanKey } from "@/lib/stripe/pricing";

export const KICKPACT_REPLY_TO = "noreply@kickpact.com";

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
 * Pure: leitet die Reply-To-Adresse aus dem höchsten Plan + Vereins-Kontakt ab.
 *
 * - Basic → `noreply@kickpact.com`
 * - Pro / Vereinslizenz → die echte Vereins-Mail (Mail des Vereins-Admins).
 *
 * Vorher stand hier `<slug>@kickpact.de` mit dem Versprechen, ein Routing-Layer
 * leite auf den Verein weiter. Den gab es nie: Antworten von Sponsoren gingen an
 * eine nicht existierende Adresse und verschwanden ohne Bounce. Für v1 ist die
 * echte Adresse die zustellbare Lösung; ein Catch-all-Routing kann später
 * darüber, wenn KickPact die Kommunikation wirklich mitlesen soll.
 *
 * Ohne bekannte Vereins-Mail fällt es bewusst auf die System-Adresse zurück —
 * lieber landet eine Antwort bei uns als in einem Blackhole.
 */
export function deriveReplyTo(
  plan: PlanKey,
  clubContactEmail: string | null
): string {
  if (plan === "basic") return KICKPACT_REPLY_TO;
  const contact = clubContactEmail?.trim();
  return contact ? contact : KICKPACT_REPLY_TO;
}
