"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUserOrThrow } from "@/lib/auth/session";
import {
  upsertNotificationSettings,
  markNotificationRead,
  markAllNotificationsRead
} from "@/lib/db/queries/notifications";

const settingsSchema = z.object({
  matchResults: z.boolean(),
  accessRequests: z.boolean(),
  sponsorRequests: z.boolean(),
  billing: z.boolean(),
  emailRecurring: z.boolean()
});

export type NotificationSettingsInput = z.infer<typeof settingsSchema>;

export async function updateNotificationSettings(
  input: NotificationSettingsInput
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUserOrThrow();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { error: "Ungültige Eingabe" };
  await upsertNotificationSettings({ userId: user.id, ...parsed.data });
  revalidatePath("/konto/benachrichtigungen");
  return { ok: true };
}

export async function markNotificationReadAction(
  notificationId: string
): Promise<{ ok: true } | { error: string }> {
  const user = await requireUserOrThrow();
  if (!notificationId) return { error: "Fehlende ID" };
  await markNotificationRead(user.id, notificationId);
  revalidatePath("/konto/benachrichtigungen");
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<{ ok: true }> {
  const user = await requireUserOrThrow();
  await markAllNotificationsRead(user.id);
  revalidatePath("/konto/benachrichtigungen");
  return { ok: true };
}
