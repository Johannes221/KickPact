/**
 * Plausible Custom-Event-Tracking (Client-Side).
 *
 * Ruft `window.plausible(event, { props })` auf — falls das Plausible-Snippet
 * (siehe `components/analytics/plausible-script.tsx`) im Browser geladen wurde.
 *
 * No-op falls:
 *  - SSR / Server Component (kein `window`)
 *  - Plausible-Script nicht geladen (z.B. NODE_ENV !== "production" oder
 *    NEXT_PUBLIC_PLAUSIBLE_DOMAIN nicht gesetzt)
 *  - Test-Umgebung (NODE_ENV === "test")
 *
 * Damit kann jede Komponente bedenkenlos `track(...)` aufrufen, ohne sich um
 * Render-Kontext, Env oder Provider zu kümmern.
 */

export type EventName =
  | "signup_started"
  | "signup_completed"
  | "verein_onboarding_step1_completed"
  | "verein_onboarding_step2_completed"
  | "verein_onboarding_step3_completed"
  | "verein_onboarding_completed"
  | "sponsor_onboarding_completed"
  | "pledge_created"
  | "pledge_first_charge"
  | "stripe_checkout_started"
  | "stripe_subscription_created"
  | "pricing_tier_clicked"
  | "pricing_cycle_switched"
  | "abo_cycle_switched"
  | "referral_share_click";

export type EventProps = Record<string, string | number | boolean>;

// Plausible erweitert das `window`-Objekt um eine optionale `plausible`-Funktion.
// Wir typisieren minimal — nur was wir hier rufen.
declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: EventProps }) => void;
  }
}

/**
 * Track ein benanntes Conversion-Event.
 *
 * @example
 * track("signup_started");
 * track("pricing_tier_clicked", { tier: "pro", cycle: "season" });
 */
export function track(event: EventName, props?: EventProps): void {
  // SSR-Guard
  if (typeof window === "undefined") return;
  // Test-Guard — keine Tracking-Calls in Vitest / Playwright-Setup.
  if (process.env.NODE_ENV === "test") return;
  // Plausible-Snippet noch nicht geladen → silent no-op.
  if (typeof window.plausible !== "function") return;

  try {
    window.plausible(event, props ? { props } : undefined);
  } catch (err) {
    // Tracking darf nie die App crashen.
    console.warn("[analytics] track failed", err);
  }
}
