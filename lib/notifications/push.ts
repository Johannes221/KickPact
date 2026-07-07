import type { ApnsPayload, ApnsSender } from "./apns";
import { realApnsSender, isApnsConfigured, isDeadTokenResult, isSuspectTokenResult } from "./apns";
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
  /** Gesetzt, wenn nichts (Sinnvolles) passiert ist. */
  skipped?: "not-configured" | "no-tokens" | "error" | "mass-failure";
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
    const dead = results.filter(isDeadTokenResult);

    // Mass-Failure-Guard: Stirbt ein KOMPLETTER Batch und besteht das Sterben
    // nur aus Env-/Topic-Symptomen (BadDeviceToken/DeviceTokenNotForTopic), ist
    // das fast sicher eine Fehlkonfiguration (falscher APNS_PRODUCTION-Host o.ä.)
    // — Apple antwortet dann für JEDEN Token so. Löschen würde erreichbare User
    // aus device_tokens werfen. Deshalb: nicht löschen, laut alarmieren. Ein
    // echter Voll-Uninstall (410/Unregistered) enthält KEINE Suspect-Gründe und
    // wird weiterhin normal aufgeräumt.
    const wholeBatchDead = results.length > 0 && dead.length === results.length;
    if (wholeBatchDead && dead.every(isSuspectTokenResult)) {
      console.error(
        "[push] ALLE Tokens tot via Env-Symptom — Cleanup verweigert (vermutlich APNs-Host/Topic-Fehlkonfig)",
        { userId, tokenCount: results.length, reasons: [...new Set(dead.map((r) => r.reason))] }
      );
      return { sent: 0, removed: 0, skipped: "mass-failure" };
    }

    const deadTokens = dead.map((r) => r.token);
    if (deadTokens.length > 0) await deps.removeTokens(deadTokens);

    return { sent: results.filter((r) => r.ok).length, removed: deadTokens.length };
  } catch (err) {
    console.error("[push] sendPushToUser failed", {
      userId,
      error: err instanceof Error ? err.message : String(err)
    });
    return { sent: 0, removed: 0, skipped: "error" };
  }
}
