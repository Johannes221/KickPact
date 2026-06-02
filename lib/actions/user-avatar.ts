import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { normalizeImageUpload } from "@/lib/storage/images";
import { storeDocument } from "@/lib/storage/documents";

/**
 * Lädt das Profilbild des Nutzers hoch (HEIC/HEIF → JPEG, Validierung in
 * `normalizeImageUpload`) und setzt `users.image` auf den Storage-Key.
 *
 * Aufruf NUR aus dem authentifizierten Route-Handler (`/api/user/avatar`) —
 * `userId` stammt aus der Server-Session, ein Nutzer kann also nur sein
 * eigenes Bild setzen. Bewusst Route-Handler statt Server-Action wegen des
 * 1-MB-Body-Limits (iPhone-Fotos), analog zu `uploadTeamLogo`.
 */
export async function uploadUserAvatar(input: {
  userId: string;
  filename: string;
  contentType: string;
  bytes: Buffer;
}): Promise<{ imageUrl: string }> {
  if (!input.userId || !input.filename || !input.bytes) {
    throw new Error("Unvollständige Profilbild-Daten.");
  }

  const normalized = await normalizeImageUpload({
    bytes: input.bytes,
    contentType: input.contentType,
    filename: input.filename
  });

  const key = `users/${input.userId}/avatar-${createId()}.${normalized.ext}`;
  const storageUrl = await storeDocument(key, normalized.bytes, normalized.contentType);

  await db.update(users).set({ image: storageUrl }).where(eq(users.id, input.userId));

  return { imageUrl: storageUrl };
}

/** Liest den aktuellen Avatar-Storage-Key des Nutzers (für die GET-Auslieferung). */
export async function getUserAvatarKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ image: users.image })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.image ?? null;
}
