import type { NotificationType } from "@/lib/db/schema";
import { insertNotification, getNotificationSettings } from "@/lib/db/queries/notifications";
import { sendPushToUser } from "./push";

/**
 * Zentrale Zustell-API für Benachrichtigungen. Einziger Einstieg für
 * Inngest-Functions / Server-Actions.
 *
 * Pro Empfänger:
 *  1. IMMER eine `notifications`-Zeile schreiben (In-App-Inbox = volle Historie).
 *  2. Push NUR, wenn die Kategorie in `notification_settings` aktiviert ist
 *     (Opt-out: fehlende Zeile = alles an) UND APNs konfiguriert ist.
 *
 * Alles best-effort: ein Fehler bei einem Empfänger reißt die anderen nicht mit.
 */

type PrefCategory = "matchResults" | "accessRequests" | "sponsorRequests" | "billing";

export function prefCategoryForType(type: NotificationType): PrefCategory {
  switch (type) {
    case "match_result":
      return "matchResults";
    case "access_request":
      return "accessRequests";
    case "sponsor_inquiry":
    case "sponsor_lead":
      return "sponsorRequests";
    case "invoice_created":
    case "trial_ending":
      return "billing";
  }
}

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-Link-Pfad (relativ) — landet in der Inbox UND im Push-Payload. */
  link?: string | null;
  data?: Record<string, unknown> | null;
}

export async function notifyUser(input: NotifyInput): Promise<void> {
  // 1. In-App-Inbox.
  try {
    await insertNotification({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      data: input.data ?? null
    });
  } catch (err) {
    console.error("[notify] insert failed", {
      userId: input.userId,
      type: input.type,
      error: err instanceof Error ? err.message : String(err)
    });
    // Inbox-Schreiben fehlgeschlagen — Push trotzdem versuchen.
  }

  // 2. Push (gated durch Präferenz).
  try {
    const settings = await getNotificationSettings(input.userId);
    const category = prefCategoryForType(input.type);
    const pushEnabled = settings ? settings[category] : true; // Opt-out-Default
    if (!pushEnabled) return;

    await sendPushToUser(input.userId, {
      title: input.title,
      body: input.body,
      data: {
        type: input.type,
        ...(input.link ? { link: input.link } : {}),
        ...(input.data ?? {})
      }
    });
  } catch (err) {
    console.error("[notify] push failed", {
      userId: input.userId,
      error: err instanceof Error ? err.message : String(err)
    });
  }
}

/** Wie `notifyUser`, aber an mehrere (deduplizierte) Empfänger. */
export async function notifyUsers(
  userIds: string[],
  input: Omit<NotifyInput, "userId">
): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  await Promise.all(unique.map((userId) => notifyUser({ ...input, userId })));
}
