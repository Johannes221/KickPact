import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teamImages } from "@/lib/db/schema";

export interface TeamImageRow {
  id: string;
  storageKey: string;
  sortOrder: number;
}

/** Galerie-Bilder eines Teams, aufsteigend nach sortOrder (dann createdAt). */
export async function listTeamImages(teamId: string): Promise<TeamImageRow[]> {
  return db
    .select({ id: teamImages.id, storageKey: teamImages.storageKey, sortOrder: teamImages.sortOrder })
    .from(teamImages)
    .where(eq(teamImages.teamId, teamId))
    .orderBy(asc(teamImages.sortOrder), asc(teamImages.createdAt));
}

export async function countTeamImages(teamId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(teamImages)
    .where(eq(teamImages.teamId, teamId));
  return Number(row?.n ?? 0);
}

/** Fügt ein Galerie-Bild ans Ende an (sortOrder = aktuelle Anzahl). */
export async function addTeamImage(teamId: string, storageKey: string): Promise<TeamImageRow> {
  const next = await countTeamImages(teamId);
  const [row] = await db
    .insert(teamImages)
    .values({ teamId, storageKey, sortOrder: next })
    .returning({ id: teamImages.id, storageKey: teamImages.storageKey, sortOrder: teamImages.sortOrder });
  return row;
}

/** Löscht ein Bild nur, wenn es zum Team gehört. Liefert true bei Treffer. */
export async function deleteTeamImage(teamId: string, imageId: string): Promise<boolean> {
  const deleted = await db
    .delete(teamImages)
    .where(and(eq(teamImages.id, imageId), eq(teamImages.teamId, teamId)))
    .returning({ id: teamImages.id });
  return deleted.length > 0;
}

/** Storage-Key eines Galerie-Bilds (für den Serve-Endpoint), team-scoped. */
export async function getTeamImageKey(teamId: string, imageId: string): Promise<string | null> {
  const [row] = await db
    .select({ storageKey: teamImages.storageKey })
    .from(teamImages)
    .where(and(eq(teamImages.id, imageId), eq(teamImages.teamId, teamId)))
    .limit(1);
  return row?.storageKey ?? null;
}
