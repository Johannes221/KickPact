import Stripe from "stripe";

/**
 * Stripe client — singleton. Wirft erst beim ersten use(), wenn STRIPE_SECRET_KEY
 * fehlt — damit der Server auch ohne Stripe-Setup booten kann (Auth, Match-UI
 * etc. funktionieren weiter).
 *
 * isStripeConfigured() exportiert für conditional UI / API rendering.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "Stripe nicht konfiguriert: STRIPE_SECRET_KEY fehlt. Setze ihn in .env.local."
    );
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-04-22.dahlia",
      typescript: true,
      // Vibe-Check C: transiente Netzwerk-Blips bei Read-Calls (z.B. im Webhook)
      // automatisch abfangen. Stripe garantiert Idempotenz auf Retries; Writes
      // setzen zusätzlich eigene Idempotency-Keys.
      maxNetworkRetries: 2,
      timeout: 20_000
    });
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/**
 * Webhook-Secret separat — wird nur beim Stripe → KickPact-Webhook benötigt.
 */
export function getStripeWebhookSecret(): string {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET fehlt");
  }
  return process.env.STRIPE_WEBHOOK_SECRET;
}
