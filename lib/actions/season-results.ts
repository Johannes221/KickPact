"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { seasonResults, teams, clubs } from "@/lib/db/schema";
import { assertClubWriteAccessAllowPaused } from "@/lib/auth/scope";
import { inngest } from "@/lib/inngest/client";

const schema = z.object({
  teamId: z.string().min(1),
  saison: z.string().min(4),
  finalPosition: z.number().int().min(1).max(40).optional(),
  teamsInLeague: z.number().int().min(2).max(40).optional(),
  promoted: z.boolean().optional().default(false),
  relegated: z.boolean().optional().default(false),
  cupRoundReached: z.string().optional(),
  customNotes: z.string().max(2000).optional()
});

/**
 * Trainer/Admin trägt den End-Stand einer Saison ein. Saison-Wetten-Charges
 * werden anschließend vom Inngest-Job `evaluate-season` ausgewertet.
 */
export async function setSeasonResult(input: z.infer<typeof schema>) {
  const parsed = schema.parse(input);

  const [team] = await db
    .select({ team: teams, clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, parsed.teamId))
    .limit(1);
  if (!team) throw new Error("Mannschaft nicht gefunden");
  // R8: Saison-Endstand muss auch in der Saison-Pass-Sommerpause (paused)
  // eintragbar sein — die Saison endet 30.6., genau dann wird eingetragen.
  await assertClubWriteAccessAllowPaused(team.clubSlug, "admin");

  // upsert
  const existing = await db
    .select({ id: seasonResults.id })
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, parsed.teamId), eq(seasonResults.saison, parsed.saison)))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(seasonResults)
      .set({
        finalPosition: parsed.finalPosition ?? null,
        teamsInLeague: parsed.teamsInLeague ?? null,
        promoted: parsed.promoted ?? false,
        relegated: parsed.relegated ?? false,
        cupRoundReached: parsed.cupRoundReached ?? null,
        customNotes: parsed.customNotes ?? null,
        evaluatedAt: new Date()
      })
      .where(eq(seasonResults.id, existing[0].id));
  } else {
    await db.insert(seasonResults).values({
      teamId: parsed.teamId,
      saison: parsed.saison,
      finalPosition: parsed.finalPosition ?? null,
      teamsInLeague: parsed.teamsInLeague ?? null,
      promoted: parsed.promoted ?? false,
      relegated: parsed.relegated ?? false,
      cupRoundReached: parsed.cupRoundReached ?? null,
      customNotes: parsed.customNotes ?? null
    });
  }

  // Trigger Inngest evaluate-season — der Job erzeugt Charges für alle aktiven
  // Saison-Wetten-Pledges dieser Mannschaft.
  await inngest.send({
    name: "season/result-set",
    data: { teamId: parsed.teamId, saison: parsed.saison }
  });

  revalidatePath(`/verein/${team.clubSlug}/mannschaft/${parsed.teamId}`);
  revalidatePath(`/verein/${team.clubSlug}`);
}
