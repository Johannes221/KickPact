import type { ApnsPayload, ApnsSender } from "./apns";
import { realApnsSender, isApnsConfigured, isDeadTokenResult } from "./apns";
import { getDeviceTokensForUser, deleteDeviceTokens } from "@/lib/db/queries/device-tokens";

/**
 * Best-effort Push-Versand an alle Geräte eines Users.
 *
 * - Lädt die Tokens des Users, sendet via APNs, räumt tote Tokens (410 /
 *   Unregistered / BadDeviceToken) auf.
 * - Fehler sind NIE fatal: Wirft nie nach oben, jeder Fehlerpfad gibt ein
 *   Ergebnis-Objekt zurück. Inngest-/Action-Aufrufer dürfen den Call nicht
 *   um ihren eigenen Erfolg bangen lassen.
 * - Dependencies sind injizierbar → Unit-Tests brauchen kein echtes HTTP/2.
 */
export interface PushDeps {
  getTokens: (userId: string) => Promise<string[]>;
  send: ApnsSender;
  removeTokens: (tokens: string[]) => Promise<void>;
  isConfigured: () => boolean;
}

export const defaultPushDeps: PushDeps = {
  getTokens: getDeviceTokensForUser,
  send: realApnsSender,
  removeTokens: deleteDeviceTokens,
  isConfigured: isApnsConfigured
};

export interface PushResult {
  sent: number;
  removed: number;
  /** Gesetzt, wenn nichts gesendet wurde — "not-configured" | "no-tokens" | "error". */
  skipped?: "not-configured" | "no-tokens" | "error";
}

export async function sendPushToUser(
  userId: string,
  payload: ApnsPayload,
  deps: PushDeps = defaultPushDeps
): Promise<PushResult> {
  try {
    if (!deps.isConfigured()) return { sent: 0, removed: 0, skipped: "not-configured" };

    const tokens = await deps.getTokens(userId);
    if (tokens.length === 0) return { sent: 0, removed: 0, skipped: "no-tokens" };

    const results = await deps.send(tokens, payload);
    const dead = results.filter(isDeadTokenResult).map((r) => r.token);
    if (dead.length > 0) await deps.removeTokens(dead);

    return { sent: results.filter((r) => r.ok).length, removed: dead.length };
  } catch (err) {
    console.error("[push] sendPushToUser failed", {
      userId,
      error: err instanceof Error ? err.message : String(err)
    });
    return { sent: 0, removed: 0, skipped: "error" };
  }
}
