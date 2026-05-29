"use server";

import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, clubMemberships } from "@/lib/db/schema";
import { requireUserOrThrow } from "@/lib/auth/session";

/**
 * Verwirft einen Onboarding-Draft-Club des aktuellen Users — z.B. wenn er im
 * Wizard „zurück" geht und einen anderen Verein wählen will.
 *
 * Sicherheits-Guards:
 *   - Nur der admin-Owner darf verwerfen.
 *   - Nur Clubs mit onboardingStatus != 'completed' (ein fertig onboardeter
 *     Verein wird NIE über diesen Pfad gelöscht).
 *
 * Der Delete cascadet über die FK-Constraints auf teams, subscriptions,
 * team_licenses, club_memberships und invitations (alle onDelete: cascade).
 *
 * Idempotent: existiert der Club nicht (mehr) oder ist er nicht löschbar,
 * passiert nichts (kein Fehler) — der Aufrufer landet danach ohnehin im
 * frischen Verein-Step.
 */
export async function discardDraftClub(clubId: string): Promise<{ ok: true }> {
  const user = await requireUserOrThrow();

  // Owner-Check: admin-Membership des aktuellen Users auf diesen Club.
  const [membership] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, clubId))
    )
    .limit(1);

  if (!membership || membership.role !== "admin") {
    // Nicht der Owner → still nichts tun (kein Leak, ob der Club existiert).
    return { ok: true };
  }

  // Nur Drafts löschen, niemals einen completed-Verein.
  await db
    .delete(clubs)
    .where(and(eq(clubs.id, clubId), ne(clubs.onboardingStatus, "completed")));

  return { ok: true };
}
