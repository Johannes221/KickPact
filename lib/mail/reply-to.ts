import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, teamLicenses } from "@/lib/db/schema";
import type { PlanKey } from "@/lib/stripe/pricing";
import {
  KICKPACT_REPLY_TO,
  deriveReplyTo,
  highestPlanFrom
} from "./reply-to-pure";

export { KICKPACT_REPLY_TO, deriveReplyTo, highestPlanFrom };

/**
 * Liefert die korrekte Reply-To-Adresse für eine Club-Mail.
 *
 * Logic:
 *   1. Lade alle Team-Licenses des Clubs.
 *   2. Bestimme höchstes Tier (basic < pro < verein).
 *   3. Basic → System-Adresse; sonst Club-Alias.
 *
 * Wird in allen Inngest-Mail-Templates (außer magic-link) genutzt.
 */
export async function getReplyToForClub(clubId: string): Promise<string> {
  const rows = await db
    .select({ plan: teamLicenses.plan, slug: clubs.slug })
    .from(teamLicenses)
    .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(clubs.id, clubId));

  if (rows.length === 0) return KICKPACT_REPLY_TO;

  const plans = rows.map((r) => r.plan as PlanKey);
  const top = highestPlanFrom(plans);
  return deriveReplyTo(top, rows[0].slug);
}
