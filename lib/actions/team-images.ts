"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { assertTeamWriteAccess } from "@/lib/auth/scope";
import { storeDocument } from "@/lib/storage/documents";
import { normalizeImageUpload } from "@/lib/storage/images";
import { addTeamImage, countTeamImages, deleteTeamImage } from "@/lib/db/queries/team-images";

const MAX_GALLERY_IMAGES = 8;

async function authTeam(teamId: string) {
  // Team-aware Autorisierung (folgt licensedUnderClubId ?? clubId, blockt
  // Club-Admin-Durchgriff auf autarke/lizenz-transferierte Teams). Zuerst der
  // Guard (redirect/throw bei fehlendem Zugriff), dann den Container-clubSlug
  // für die Pfad-Revalidierung nachladen.
  await assertTeamWriteAccess(teamId, { clubMinRole: "admin" });
  const [row] = await db
    .select({ clubSlug: clubs.slug })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) throw new Error("Mannschaft nicht gefunden.");
  return row.clubSlug;
}

function revalidateTeam(clubSlug: string, teamId: string) {
  revalidatePath(`/verein/${clubSlug}/mannschaft/${teamId}/profil`);
}

export async function uploadTeamCover(input: {
  teamId: string; filename: string; contentType: string; bytes: Buffer;
}): Promise<{ coverUrl: string }> {
  const clubSlug = await authTeam(input.teamId);
  const norm = await normalizeImageUpload({ bytes: input.bytes, contentType: input.contentType, filename: input.filename });
  const key = `teams/${input.teamId}/cover-${createId()}.${norm.ext}`;
  const storageUrl = await storeDocument(key, norm.bytes, norm.contentType);
  await db.update(teams).set({ coverUrl: storageUrl }).where(eq(teams.id, input.teamId));
  revalidateTeam(clubSlug, input.teamId);
  return { coverUrl: storageUrl };
}

export async function addTeamGalleryImage(input: {
  teamId: string; filename: string; contentType: string; bytes: Buffer;
}): Promise<{ id: string; storageKey: string }> {
  const clubSlug = await authTeam(input.teamId);
  if ((await countTeamImages(input.teamId)) >= MAX_GALLERY_IMAGES) {
    throw new Error(`Maximal ${MAX_GALLERY_IMAGES} Galerie-Bilder erlaubt.`);
  }
  const norm = await normalizeImageUpload({ bytes: input.bytes, contentType: input.contentType, filename: input.filename });
  const key = `teams/${input.teamId}/gallery-${createId()}.${norm.ext}`;
  const storageUrl = await storeDocument(key, norm.bytes, norm.contentType);
  const row = await addTeamImage(input.teamId, storageUrl);
  revalidateTeam(clubSlug, input.teamId);
  return { id: row.id, storageKey: row.storageKey };
}

export async function removeTeamGalleryImage(input: { teamId: string; imageId: string }): Promise<void> {
  const clubSlug = await authTeam(input.teamId);
  await deleteTeamImage(input.teamId, input.imageId);
  revalidateTeam(clubSlug, input.teamId);
}

export async function setTeamShowInsights(input: { teamId: string; show: boolean }): Promise<void> {
  const clubSlug = await authTeam(input.teamId);
  await db.update(teams).set({ showInsights: input.show }).where(eq(teams.id, input.teamId));
  revalidateTeam(clubSlug, input.teamId);
}
