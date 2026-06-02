import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  notifications,
  notificationSettings,
  type NotificationType,
  type NotificationSettingsRow
} from "@/lib/db/schema";

export type NotificationRow = typeof notifications.$inferSelect;

/** Eine In-App-Notification schreiben. Gibt die erzeugte Zeile zurück. */
export async function insertNotification(args: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  data?: Record<string, unknown> | null;
}): Promise<NotificationRow> {
  const [row] = await db
    .insert(notifications)
    .values({
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      link: args.link ?? null,
      dataJson: args.data ?? null
    })
    .returning();
  return row;
}

/** Inbox-Liste (neueste zuerst). */
export async function listNotifications(
  userId: string,
  limit = 50
): Promise<NotificationRow[]> {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/** Anzahl ungelesener Notifications eines Users. */
export async function countUnreadNotifications(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

/** Eine Notification als gelesen markieren (nur eigene). */
export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      )
    );
}

/** Alle ungelesenen Notifications eines Users als gelesen markieren. */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

/**
 * Push-Präferenzen eines Users. Gibt `null` zurück, wenn keine Zeile existiert
 * — Aufrufer behandeln das als „alle Kategorien aktiviert" (Opt-out-Modell).
 */
export async function getNotificationSettings(
  userId: string
): Promise<NotificationSettingsRow | null> {
  const [row] = await db
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  return row ?? null;
}

/** Push-Präferenzen setzen/aktualisieren. */
export async function upsertNotificationSettings(args: {
  userId: string;
  matchResults: boolean;
  accessRequests: boolean;
  sponsorRequests: boolean;
  billing: boolean;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(notificationSettings)
    .values({
      userId: args.userId,
      matchResults: args.matchResults,
      accessRequests: args.accessRequests,
      sponsorRequests: args.sponsorRequests,
      billing: args.billing,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: notificationSettings.userId,
      set: {
        matchResults: args.matchResults,
        accessRequests: args.accessRequests,
        sponsorRequests: args.sponsorRequests,
        billing: args.billing,
        updatedAt: now
      }
    });
}
