import { NextRequest, NextResponse } from "next/server";
import type {
  Data,
  JWSTransactionDecodedPayload
} from "@apple/app-store-server-library";
import {
  isAppleIapConfigured,
  verifyNotification,
  verifyTransaction
} from "@/lib/apple/verifier";
import { mapAppleNotificationToStatus } from "@/lib/billing/apple-notifications";
import { appleProductToPlanCycle } from "@/lib/stripe/pricing";
import {
  hasStripeEventBeenProcessed,
  markStripeEventProcessed,
  getClubIdByOriginalTransactionId,
  getAppleExpiresAt,
  syncAppleSubscriptionForClub,
  setTeamLicensesPlanForSubscription,
  setTeamLicensesStatusForClubTeams
} from "@/lib/db/queries/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Part B — App Store Server Notifications V2. Spiegelt den Stripe-Webhook:
 * Dedup über dieselbe processed_stripe_events-Tabelle (Key = notificationUUID),
 * Marker erst NACH erfolgreichem Handling (A4-Muster), Mapping → Status.
 *
 * Type-Nuance: In `Data` ist `signedTransactionInfo` laut Apple-Lib ein roher
 * JWS-String, der ein ZWEITES Mal über `verifyTransaction()` decodiert werden
 * muss, um an productId/originalTransactionId/expiresDate zu kommen.
 * `decodeTransactionInfo()` kapselt diesen zweiten Decode (und akzeptiert
 * defensiv auch eine bereits decodierte Payload, falls die Lib-Version sie
 * schon flach liefert) — ohne `any`/`as unknown as`.
 */
export async function POST(req: NextRequest) {
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "apple-not-configured" }, { status: 503 });
  }

  let signedPayload: string | undefined;
  try {
    ({ signedPayload } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  if (!signedPayload) {
    return NextResponse.json({ error: "missing-payload" }, { status: 400 });
  }

  let n: Awaited<ReturnType<typeof verifyNotification>>;
  try {
    n = await verifyNotification(signedPayload);
  } catch (err) {
    console.error("[apple-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  const uuid = n.notificationUUID;
  const type = n.notificationType;
  if (!uuid || !type) {
    console.warn("[apple-webhook] notification missing uuid/type — ignoring");
    return NextResponse.json({ received: true });
  }

  if (await hasStripeEventBeenProcessed(uuid)) {
    console.info("[apple-webhook] duplicate notification, skipping", { uuid });
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    const status = mapAppleNotificationToStatus(type);
    if (status) {
      const tx = await decodeTransactionInfo(n.data);
      const otx = tx?.originalTransactionId;
      const planCycle = tx?.productId
        ? appleProductToPlanCycle(tx.productId)
        : null;

      if (otx && planCycle) {
        const clubId = await getClubIdByOriginalTransactionId(otx);
        if (clubId) {
          // Reorder-Guard (MEDIUM-1): Apple ASSN v2 garantiert keine Reihen-
          // folge. Eine reordered ältere Notification (kleineres expiresDate)
          // darf einen neueren Zustand NICHT überschreiben. Strikt älteres
          // expiresDate → skippen (aber als processed markieren + 200).
          const incomingExpires = tx?.expiresDate ? new Date(tx.expiresDate) : null;
          const stored = await getAppleExpiresAt(clubId);
          if (
            stored &&
            incomingExpires &&
            incomingExpires.getTime() < stored.getTime()
          ) {
            console.warn(
              "[apple-webhook] stale notification (older expiresDate) — skipping write",
              { clubId }
            );
          } else {
            await syncAppleSubscriptionForClub(clubId, {
              originalTransactionId: otx,
              status,
              billingCycle: planCycle.cycle,
              appleExpiresAt: tx?.expiresDate ? new Date(tx.expiresDate) : null
            });
            if (status === "cancelled") {
              await setTeamLicensesStatusForClubTeams(clubId, "cancelled");
            } else if (status === "active") {
              await setTeamLicensesPlanForSubscription(clubId, planCycle.plan);
              await setTeamLicensesStatusForClubTeams(clubId, "active");
            }
          }
        } else {
          console.warn("[apple-webhook] no club for originalTransactionId", otx);
        }
      }
    }
    // Marker erst nach Erfolg (A4). Unbekannte Typen werden ebenfalls markiert.
    await markStripeEventProcessed(uuid, type);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[apple-webhook] handler error", err);
    return NextResponse.json({ error: "handler-failure" }, { status: 500 });
  }
}

/**
 * Holt die decodierte Transaction-Payload aus `data.signedTransactionInfo`.
 *
 * Laut Apple-Lib ist `signedTransactionInfo` ein JWS-STRING und muss separat
 * über `verifyTransaction()` (signaturgeprüft) decodiert werden. Falls eine
 * Lib-Version das Feld bereits als Objekt liefert, wird es direkt durchgereicht.
 * Beides typsicher, ohne `any`/`as unknown as`.
 */
async function decodeTransactionInfo(
  data: Data | undefined
): Promise<JWSTransactionDecodedPayload | null> {
  const signed = data?.signedTransactionInfo;
  if (!signed) return null;
  if (typeof signed === "string") {
    return verifyTransaction(signed);
  }
  return signed;
}
