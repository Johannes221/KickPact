import { isIOSApp } from "@/lib/platform/native";

export type CheckoutChannel = "stripe" | "apple";

/**
 * Part B — der einzige Entscheider, welcher Bezahlpfad + welche Preis-Darstellung
 * gilt. Im iOS-Kontext IMMER Apple (Anti-Steering, Guideline 3.1.1/3.1.3 — kein
 * Stripe-CTA, keine Web-Preise). Auf Web: Stripe.
 *
 * Client-only (isIOSApp braucht window). Server-Pfade nutzen isNativeAppRequest()
 * aus lib/platform/native-server.ts.
 */
export function getCheckoutChannel(): CheckoutChannel {
  return isIOSApp() ? "apple" : "stripe";
}
