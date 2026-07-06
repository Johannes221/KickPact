/**
 * Plausible Server-Side-Event-Tracking.
 *
 * Für Conversion-Events, die nicht im Browser passieren — z.B. Stripe-Webhook
 * `customer.subscription.created`. Plausible bietet dafür eine
 * `POST /api/event`-API, die einen User-Agent + IP-Header erwartet.
 *
 * Doku: https://plausible.io/docs/events-api
 *
 * Wir nutzen einen synthetischen User-Agent (`KickPact-Server/1.0`) damit
 * Plausible nicht eigenen Bot-Traffic dedupliziert. Der `url`-Parameter muss
 * gesetzt sein (z.B. die Webhook-relevante URL aus der Subscription-Session
 * oder ein synthetischer Pfad wie `https://kickpact.de/server/subscription`).
 *
 * No-op falls:
 *  - NEXT_PUBLIC_PLAUSIBLE_DOMAIN nicht gesetzt
 *  - NODE_ENV === "test"
 *  - NODE_ENV !== "production" (Default skip in dev)
 */

import type { EventName, EventProps } from "./track";

// Self-hosted Plausible-Instanz unter analytics.schartl.dev. Host via
// NEXT_PUBLIC_PLAUSIBLE_HOST überschreibbar (ohne Trailing-Slash).
const PLAUSIBLE_HOST = (
  process.env.NEXT_PUBLIC_PLAUSIBLE_HOST ?? "https://analytics.schartl.dev"
).replace(/\/$/, "");
const PLAUSIBLE_ENDPOINT = `${PLAUSIBLE_HOST}/api/event`;
const USER_AGENT = "KickPact-Server/1.0";

/**
 * Sendet ein Plausible-Event vom Server. Fehler werden geloggt aber niemals
 * geworfen — Analytics-Issues dürfen nie einen Webhook scheitern lassen.
 *
 * @param event Event-Name (siehe EventName-Union in `track.ts`)
 * @param url   Vollständige URL die dem Event zugerechnet wird (z.B.
 *              `https://kickpact.de/server/subscription`). Plausible verlangt
 *              den Host in der URL, sonst wird das Event verworfen.
 * @param props Optionale Custom-Props.
 */
export async function trackServer(
  event: EventName,
  url: string,
  props?: EventProps
): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  if (process.env.NODE_ENV !== "production") return;
  const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  if (!domain) return;

  try {
    const res = await fetch(PLAUSIBLE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT
      },
      body: JSON.stringify({
        name: event,
        url,
        domain,
        props
      }),
      // Hängendes Plausible darf Aufrufer (v.a. Stripe-Webhook) nie stallen.
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) {
      console.warn(
        `[analytics-server] Plausible responded ${res.status} for event "${event}"`
      );
    }
  } catch (err) {
    console.warn(`[analytics-server] failed to send event "${event}"`, err);
  }
}
