import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { deviceTokens } from "@/lib/db/schema";

/**
 * APNs-Device-Token registrieren/aktualisieren. Der Token ist PK — registriert
 * sich dasselbe Gerät unter einem anderen User neu, übernimmt der Upsert den
 * neuen `userId` und schreibt `lastSeenAt` fort.
 */
export async function upsertDeviceToken(args: {
  token: string;
  userId: string;
  platform?: "ios" | "android";
}): Promise<void> {
  const now = new Date();
  await db
    .insert(deviceTokens)
    .values({
      token: args.token,
      userId: args.userId,
      platform: args.platform ?? "ios",
      lastSeenAt: now
    })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: { userId: args.userId, platform: args.platform ?? "ios", lastSeenAt: now }
    });
}

/** Alle Push-Tokens eines Users. */
export async function getDeviceTokensForUser(userId: string): Promise<string[]> {
  const rows = await db
    .select({ token: deviceTokens.token })
    .from(deviceTokens)
    .where(eq(deviceTokens.userId, userId));
  return rows.map((r) => r.token);
}

/**
 * Tokens löschen — genutzt fürs 410/Unregistered-Cleanup nach einem
 * APNs-Reject und beim Logout/Opt-out in der App.
 */
export async function deleteDeviceTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  await db.delete(deviceTokens).where(inArray(deviceTokens.token, tokens));
}
