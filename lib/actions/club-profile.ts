"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { revalidatePath } from "next/cache";
import { assertClubWriteAccessAllowPaused } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";
import { normalizeImageUpload } from "@/lib/storage/images";
import { storeDocument } from "@/lib/storage/documents";

/**
 * Pflege des öffentlichen Vereinsprofils /v/[slug] (Phase 5 Paket C).
 *
 * Hero-Upload läuft NICHT als Server-Action, sondern über den Route-Handler
 * app/api/clubs/[clubId]/hero (Next drosselt Server-Action-Bodies auf 1 MB —
 * gleiche Falle wie beim Team-Logo, siehe app/api/teams/[teamId]/logo).
 * `uploadClubHero` wird dort als normale Funktion aufgerufen.
 */

const DESCRIPTION_MAX = 2000;

const updatePublicProfileSchema = z.object({
  descriptionMd: z
    .string()
    .max(DESCRIPTION_MAX, `Beschreibung zu lang — max. ${DESCRIPTION_MAX} Zeichen.`)
});

export async function updateClubPublicProfile(
  slug: string,
  input: z.infer<typeof updatePublicProfileSchema>
): Promise<{ ok: boolean; message?: string }> {
  try {
    const parsed = updatePublicProfileSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.errors[0].message };
    }

    // Read-Only-Gate (Sommerpause erlaubt): totes Abo darf das öffentliche
    // Profil nicht mehr ändern.
    const { club } = await assertClubWriteAccessAllowPaused(slug, "admin");

    await db
      .update(clubs)
      .set({
        descriptionMd: parsed.data.descriptionMd.trim() || null,
        updatedAt: new Date()
      })
      .where(eq(clubs.id, club.id));

    revalidatePath(`/verein/${slug}/einstellungen`);
    revalidatePath(`/v/${slug}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Fehler beim Speichern"
    };
  }
}

/**
 * Hero-Bild fürs öffentliche Vereinsprofil speichern. Wird vom Route-Handler
 * aufgerufen (kein Server-Action-Bodylimit). Validierung/HEIC→JPEG über
 * `normalizeImageUpload` (gleiche Pipeline wie Team-Logo/-Cover).
 */
export async function uploadClubHero(input: {
  clubId: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}): Promise<{ heroUrl: string }> {
  if (!input.clubId || !input.filename || !input.bytes) {
    throw new Error("Unvollständige Hero-Upload-Daten.");
  }

  const [club] = await db
    .select({ id: clubs.id, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.id, input.clubId))
    .limit(1);
  if (!club) throw new Error("Verein nicht gefunden.");

  await assertClubWriteAccessAllowPaused(club.slug, "admin");

  const normalized = await normalizeImageUpload({
    bytes: input.bytes,
    contentType: input.contentType,
    filename: input.filename
  });

  const key = `clubs/${input.clubId}/hero-${createId()}.${normalized.ext}`;
  const storageUrl = await storeDocument(key, normalized.bytes, normalized.contentType);

  await db
    .update(clubs)
    .set({ heroUrl: storageUrl, updatedAt: new Date() })
    .where(eq(clubs.id, input.clubId));

  revalidatePath(`/verein/${club.slug}/einstellungen`);
  revalidatePath(`/v/${club.slug}`);

  return { heroUrl: storageUrl };
}
