"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserOrThrow } from "@/lib/auth/session";
import { assertNotPlatformAdminAction } from "@/lib/auth/admin";
import { completeOnboardingDraft } from "@/lib/db/queries/onboarding-draft";

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

  const result = await completeOnboardingDraft({ userId: user.id, clubId: parsed.clubId });
  switch (result.status) {
    case "not_found":
      throw new Error("Verein nicht gefunden.");
    case "forbidden":
      throw new Error("Du bist nicht berechtigt, diesen Draft abzuschließen.");
    case "stammdaten_missing":
      throw new Error(
        "Stammdaten müssen vor Abschluss eingetragen sein. Bitte zuerst Schritt 2 abschließen."
      );
    case "ok":
      revalidatePath("/dashboard");
      revalidatePath("/select-role");
      return { clubSlug: result.clubSlug };
  }
}
