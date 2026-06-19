import type { SubscriptionStatus } from "@/lib/db/queries/subscription-status";

/**
 * Part B — App Store Server Notifications V2: notificationType → interner
 * subscription_status. Spiegelt die Mapping-Tabelle aus der Spec §4.5.
 *
 * Rückgabe null = unbekannter Typ; der Webhook antwortet dann 200 ohne Write
 * (kein Retry-Sturm, kein Status-Murks).
 */
export function mapAppleNotificationToStatus(
  notificationType: string
): SubscriptionStatus | null {
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
    case "OFFER_REDEEMED":
      return "active";
    // Auto-Renew aus/Plan-Wechsel: Abo läuft bis appleExpiresAt weiter.
    case "DID_CHANGE_RENEWAL_STATUS":
    case "DID_CHANGE_RENEWAL_PREF":
      return "active";
    // Billing-Retry-Phase (Grace) — wie Stripe past_due.
    case "DID_FAIL_TO_RENEW":
      return "past_due";
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
    case "REFUND":
    case "REVOKE":
      return "cancelled";
    default:
      return null;
  }
}
