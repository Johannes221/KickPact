/**
 * Branding-/Absender-Resolver für die Rechnungserzeugung (Spec 2026-05-26
 * §1.5, Phase 5 Paket B): steht eine Mannschaft unter Vereinslizenz
 * (teams.licensedUnderClubId gesetzt), wechselt der Rechnungs-Absender
 * SOFORT auf den Lizenz-Verein — Name/Adresse/IBAN/Withhold-Gate-verifiedAt
 * kommen dann von dort, nicht mehr vom Container-Club.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";

export type BillingClub = typeof clubs.$inferSelect;

/**
 * `licensedUnderClubId ?? clubId` → vollständige Club-Row.
 * undefined, wenn das Team (oder der aufgelöste Club) nicht existiert.
 */
export async function billingClubForTeam(
  teamId: string
): Promise<BillingClub | undefined> {
  const [team] = await db
    .select({
      clubId: teams.clubId,
      licensedUnderClubId: teams.licensedUnderClubId
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return undefined;

  const effectiveClubId = team.licensedUnderClubId ?? team.clubId;
  const [club] = await db
    .select()
    .from(clubs)
    .where(eq(clubs.id, effectiveClubId))
    .limit(1);
  return club;
}
