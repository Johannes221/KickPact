import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, clubMemberships, teams } from "@/lib/db/schema";

/**
 * Onboarding-Draft: ein noch nicht abgeschlossener Wizard-Durchlauf eines
 * Users. Der Resume-Dispatcher (`/onboarding/page.tsx`) lädt das hier, um
 * den User zur passenden Step zurückzuleiten.
 *
 * Ein User kann max. einen aktiven Draft haben. Wenn sie mehrfach onboarden,
 * blockt der UI-Layer den zweiten Versuch bis der erste abgeschlossen oder
 * verworfen ist (out of scope für Phase 1).
 */
export interface OnboardingDraft {
  clubId: string;
  slug: string;
  vereinName: string;
  fussballdeVereinId: string | null;
  onboardingStatus: "draft" | "stammdaten_complete";
  onboardingRole: "mannschaft" | "verein";
  startedAt: Date;
  /** True wenn Stammdaten (addressJson) schon eingetragen wurden. */
  hasStammdaten: boolean;
  /** Anzahl Teams unter dem Club (für Verein-Flow relevant). */
  teamCount: number;
}

/**
 * Liefert den aktiven Onboarding-Draft eines Users, falls einer existiert.
 *
 * Logik: Der älteste Club mit `onboardingStatus != 'completed'`, bei dem der
 * User Mitglied (admin) ist. Wir bevorzugen den ältesten, damit ein User der
 * versehentlich zwei Drafts gestartet hat den ersten zuerst abschließt.
 *
 * Returns null wenn kein offener Draft existiert.
 */
export async function getActiveDraftForUser(userId: string): Promise<OnboardingDraft | null> {
  const [row] = await db
    .select({
      clubId: clubs.id,
      slug: clubs.slug,
      name: clubs.name,
      fussballdeVereinId: clubs.fussballdeVereinId,
      onboardingStatus: clubs.onboardingStatus,
      onboardingRole: clubs.onboardingRole,
      startedAt: clubs.onboardingStartedAt,
      addressJson: clubs.addressJson,
      teamCount: sql<number>`(select count(*)::int from ${teams} where ${teams.clubId} = ${clubs.id})`
    })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
    .where(
      and(
        eq(clubMemberships.userId, userId),
        eq(clubMemberships.role, "admin"),
        ne(clubs.onboardingStatus, "completed")
      )
    )
    .orderBy(clubs.onboardingStartedAt)
    .limit(1);

  if (!row) return null;

  return {
    clubId: row.clubId,
    slug: row.slug,
    vereinName: row.name,
    fussballdeVereinId: row.fussballdeVereinId,
    onboardingStatus: row.onboardingStatus as "draft" | "stammdaten_complete",
    onboardingRole: row.onboardingRole,
    startedAt: row.startedAt,
    hasStammdaten: row.addressJson !== null,
    teamCount: Number(row.teamCount)
  };
}

/**
 * Liefert die nächste Onboarding-Step-URL basierend auf Draft-Status.
 * Pur — keine DB-Zugriffe. Unit-testbar.
 */
export function nextOnboardingStep(draft: OnboardingDraft): string {
  // Sponsoren-Schritt entfernt (2026-06): nach den Stammdaten wird das
  // Onboarding direkt abgeschlossen (siehe StammdatenForm → completeOnboarding →
  // Dashboard). Ein noch offener Draft führt daher IMMER (zurück) auf den
  // Stammdaten-Step; erneutes Absenden schließt ab und leitet ins Dashboard.
  // Die Einladung lebt jetzt als Dashboard-Aufgabe (Sponsoren-Tab).
  return `/onboarding/${draft.onboardingRole}/stammdaten`;
}

/** Stammdaten-Felder eines Clubs für das Pre-Fill im Onboarding-Wizard. */
export async function getClubStammdaten(clubId: string) {
  const [club] = await db
    .select({
      addressJson: clubs.addressJson,
      isSmallBusiness: clubs.isSmallBusiness,
      taxId: clubs.taxId,
      iban: clubs.iban
    })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  return club;
}
