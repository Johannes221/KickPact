"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { clubs, clubMemberships } from "@/lib/db/schema";
import { requireUserOrThrow } from "@/lib/auth/session";
import { assertNotPlatformAdminAction } from "@/lib/auth/admin";

const completeSchema = z.object({
  clubId: z.string().min(1)
});

export type CompleteOnboardingInput = z.infer<typeof completeSchema>;

export interface CompleteOnboardingResult {
  clubSlug: string;
}

/**
 * Step 3 des Onboarding-Wizards: schließt das Onboarding ab. Setzt
 * onboardingStatus = 'completed' und onboardingCompletedAt = now().
 *
 * Erlaubt nur wenn:
 *   - User ist admin dieses Clubs
 *   - Club ist im Status 'stammdaten_complete' (Step 2 muss done sein)
 *
 * Ein erneuter Aufruf eines completed-Clubs ist no-op (idempotent), damit
 * Double-Submits beim Klick auf "Fertig" nicht crashen.
 *
 * Revalidiert /dashboard und /select-role, damit die Identity-Listen den
 * neuen completed-Club sofort sehen.
 */
export async function completeOnboarding(
  input: CompleteOnboardingInput
): Promise<CompleteOnboardingResult> {
  const user = await requireUserOrThrow();
  await assertNotPlatformAdminAction(user.email);
  const parsed = completeSchema.parse(input);

  const [row] = await db
    .select({
      clubSlug: clubs.slug,
      onboardingStatus: clubs.onboardingStatus,
      memberRole: clubMemberships.role
    })
    .from(clubs)
    .leftJoin(
      clubMemberships,
      and(eq(clubMemberships.clubId, clubs.id), eq(clubMemberships.userId, user.id))
    )
    .where(eq(clubs.id, parsed.clubId))
    .limit(1);

  if (!row) throw new Error("Verein nicht gefunden.");
  if (row.memberRole !== "admin") {
    throw new Error("Du bist nicht berechtigt, diesen Draft abzuschließen.");
  }

  // Idempotent: schon completed → einfach zurückgeben.
  if (row.onboardingStatus === "completed") {
    return { clubSlug: row.clubSlug };
  }
  if (row.onboardingStatus !== "stammdaten_complete") {
    throw new Error(
      "Stammdaten müssen vor Abschluss eingetragen sein. Bitte zuerst Schritt 2 abschließen."
    );
  }

  await db
    .update(clubs)
    .set({
      onboardingStatus: "completed",
      onboardingCompletedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(clubs.id, parsed.clubId));

  revalidatePath("/dashboard");
  revalidatePath("/select-role");
  return { clubSlug: row.clubSlug };
}
