import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { clubMemberships, teams, teamLicenses } from "@/lib/db/schema";
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
 *   3. Basic → System-Adresse; sonst die Mail des Vereins-Admins.
 *
 * Es gibt keine `clubs.contact_email`-Spalte — der Vereins-Kontakt ist der
 * Admin aus `club_memberships`. Bei mehreren Admins gewinnt der älteste
 * (deterministisch, das ist in aller Regel der anlegende Vorstand).
 *
 * Wird in allen Inngest-Mail-Templates (außer magic-link) genutzt.
 */
export async function getReplyToForClub(clubId: string): Promise<string> {
  const rows = await db
    .select({ plan: teamLicenses.plan })
    .from(teamLicenses)
    .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
    .where(eq(teams.clubId, clubId));

  if (rows.length === 0) return KICKPACT_REPLY_TO;

  const top = highestPlanFrom(rows.map((r) => r.plan as PlanKey));
  if (top === "basic") return KICKPACT_REPLY_TO;

  const [admin] = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(
      and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.role, "admin"))
    )
    .orderBy(asc(clubMemberships.createdAt))
    .limit(1);

  return deriveReplyTo(top, admin?.email ?? null);
}
