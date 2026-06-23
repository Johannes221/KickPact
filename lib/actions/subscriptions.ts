"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clubs, subscriptions } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/session";
import { getSubscriptionProvider } from "@/lib/db/queries/subscriptions";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import {
  getStripePriceId,
  normalizeBillingCycle,
  type PlanKey,
  type BillingCycle
} from "@/lib/stripe/pricing";
import { getBaseUrl } from "@/lib/utils/base-url";

/**
 * Stripe-Checkout akzeptiert `subscription_data.trial_end` nur, wenn es
 * mindestens 48h in der Zukunft liegt. Kürzere Rest-Trials verfallen beim
 * Checkout (der Verein zahlt dann ab sofort) — bewusster Trade-off statt
 * trial_period_days-Reset auf volle 30 Tage (Audit 2026-06-11 / A3).
 */
const STRIPE_MIN_TRIAL_MS = 48 * 60 * 60 * 1000;

/**
 * Startet einen Stripe-Checkout-Flow für den gewählten Plan. Returnt eine
 * Hosted-Checkout-URL (Stripe.com). Bei Erfolg: 30d Trial, danach automatische
 * Abbuchung.
 *
 * - Erstellt Customer falls noch nicht vorhanden, speichert auf subscriptions.
 * - Klein-Validation: clubSlug muss zum eingeloggten Admin gehören.
 */
export async function createCheckoutSession(opts: {
  clubSlug: string;
  plan: PlanKey;
  /**
   * Billing-Cycle (monthly/season_end). Falls leer: aus subscriptions.billingCycle,
   * Fallback monthly. Pricing-v2-Audit #2 (2026-05-24): vorher wurde cycle ignoriert,
   * Saison-Pass-Checkout zeigte fälschlich Monthly-Preis.
   */
  cycle?: BillingCycle;
}): Promise<{ url: string }> {
  if (!isStripeConfigured()) {
    throw new Error(
      "Stripe ist noch nicht konfiguriert. Bitte STRIPE_SECRET_KEY + STRIPE_*_PRICE_ID setzen."
    );
  }
  const { club } = await assertClubAccess(opts.clubSlug, "admin");

  // Part B — Kanal-Invariante: kein Stripe-Checkout, wenn der Club bereits
  // über Apple IAP zahlt (kein Doppel-Abo). Die Abo-Verwaltung läuft dann
  // ausschließlich in der iOS-App / über Apple.
  const existingProvider = await getSubscriptionProvider(club.id);
  if (existingProvider === "apple") {
    throw new Error(
      "Dieser Verein zahlt bereits über die iOS-App (Apple). Bitte das Abo dort verwalten."
    );
  }

  const user = await requireUser();
  const stripe = getStripe();

  // Customer holen oder neu anlegen.
  // Akzeptiert sowohl NULL (neuer Standard seit Audit 2026-05-24) als auch
  // legacy "placeholder_…"-Strings (alte Daten aus finalize.ts vor Mai 2026)
  // — beides triggert Lazy-Create eines echten Stripe-Customers.
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, club.id))
    .limit(1);

  // Cycle-Resolution: explizit > subscriptions.billingCycle > monthly.
  // normalizeBillingCycle fängt inerte Alt-Werte (z.B. legacy 'annual') ab.
  const cycle: BillingCycle =
    opts.cycle ?? normalizeBillingCycle(existing?.billingCycle);

  const priceId = getStripePriceId(opts.plan, cycle);
  if (!priceId) {
    throw new Error(
      `Stripe Price-ID für Plan "${opts.plan}" (${cycle}) fehlt. Setze STRIPE_${opts.plan.toUpperCase()}_${cycle.toUpperCase()}_PRICE_ID.`
    );
  }

  const baseUrl = getBaseUrl();

  // Audit 2026-06-11 / Phase 2 / A1: Plan-Wechsel bei LAUFENDER Subscription
  // läuft über stripe.subscriptions.update (Items-Swap + Proration), NICHT
  // über ein zweites Checkout. Vorher entstand pro Plan-Wechsel ein zweites,
  // paralleles Abo — der Verein zahlte doppelt. Checkout bleibt nur für
  // Erst-Abo und Re-Subscribe nach Kündigung (cancelled/incomplete).
  const hasLiveStripeSubscription =
    !!existing?.stripeSubscriptionId &&
    existing.status !== "cancelled" &&
    existing.status !== "incomplete";

  if (hasLiveStripeSubscription && existing?.stripeSubscriptionId) {
    const stripeSub = await stripe.subscriptions.retrieve(
      existing.stripeSubscriptionId
    );
    const itemId = stripeSub.items?.data?.[0]?.id;
    if (!itemId) {
      throw new Error(
        "Bestehendes Stripe-Abo hat kein Subscription-Item — bitte Support kontaktieren."
      );
    }
    // Idempotenz gegen Doppelklick/Retry: ein zweiter identischer Call würde
    // sonst eine zweite Proration erzeugen (doppelte Abrechnung). Key trägt
    // die konkrete Preis-Transition (von→nach), damit ein legitimer
    // Plan-Wechsel zurück auf einen früheren Preis innerhalb von 24h NICHT als
    // Replay verschluckt wird.
    const currentPriceId = stripeSub.items?.data?.[0]?.price?.id ?? "unknown";
    await stripe.subscriptions.update(
      existing.stripeSubscriptionId,
      {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        metadata: { clubId: club.id, plan: opts.plan, cycle }
      },
      {
        idempotencyKey: `sub-update-${existing.stripeSubscriptionId}-${currentPriceId}-${priceId}`
      }
    );
    // Kein Stripe-Redirect nötig: Webhook (customer.subscription.updated)
    // spiegelt Plan/Cycle in die DB; wir leiten zurück auf die Abo-Seite.
    return { url: `${baseUrl}/verein/${club.slug}/abo?plan_changed=1` };
  }

  let customerId = existing?.stripeCustomerId ?? null;
  const isPlaceholder =
    typeof customerId === "string" && customerId.startsWith("placeholder_");

  if (!customerId || isPlaceholder) {
    // Idempotenz: ein Verein hat genau einen Stripe-Customer. Ohne Key legt
    // ein Doppelklick/Retry einen zweiten (verwaisten) Customer an.
    const customer = await stripe.customers.create(
      {
        email: user.email,
        name: club.name,
        metadata: { clubId: club.id, clubSlug: club.slug }
      },
      { idempotencyKey: `customer-create-${club.id}` }
    );
    customerId = customer.id;

    if (existing) {
      // Update existierenden Subscription-Row mit dem echten Customer-ID
      await db
        .update(subscriptions)
        .set({ stripeCustomerId: customerId, updatedAt: new Date() })
        .where(eq(subscriptions.clubId, club.id));
    } else {
      // Fallback: kein subscriptions-Row da (sollte nach Onboarding nicht
      // passieren, aber defensiv für direkte Checkouts ohne Onboarding-Pfad).
      await db
        .insert(subscriptions)
        .values({
          clubId: club.id,
          stripeCustomerId: customerId,
          status: "trialing"
        })
        .onConflictDoNothing();
    }
  }

  // Trial nur wenn echter App-Trial noch läuft: status='trialing' UND noch
  // kein Stripe-Abo (stripeSubscriptionId IS NULL). Nach Trial-Ende (cancelled,
  // past_due etc.) kein zweiter kostenloser Trial.
  //
  // Audit 2026-06-11 / Phase 2 / A3: trial_end = restliche App-Trial-Zeit
  // (subscriptions.trialEndsAt) statt trial_period_days=30. Vorher startete
  // der Stripe-Trial beim Checkout neu — wer an Tag 25 Zahlungsdaten
  // hinterlegte, bekam 55 Tage gratis statt 30.
  const trialEndsAtMs = existing?.trialEndsAt
    ? new Date(existing.trialEndsAt).getTime()
    : null;
  const isAppTrial =
    existing?.status === "trialing" &&
    !existing?.stripeSubscriptionId &&
    trialEndsAtMs !== null &&
    trialEndsAtMs - Date.now() >= STRIPE_MIN_TRIAL_MS;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    // Audit 2026-06-11 / Phase 2 / A2: KEINE payment_method_types-Liste —
    // Dynamic Payment Methods (Stripe-Dashboard) steuert das Angebot. Die
    // frühere Hardcoding-Liste ["card","sepa_debit","paypal"] hat jede
    // Dashboard-Konfiguration (z.B. Link, neue Methoden) stillschweigend
    // ausgesperrt. Recurring-untaugliche Methoden filtert Stripe im
    // subscription-Mode selbst heraus.
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      ...(isAppTrial && trialEndsAtMs
        ? { trial_end: Math.floor(trialEndsAtMs / 1000) }
        : {}),
      metadata: { clubId: club.id, plan: opts.plan, cycle }
    },
    success_url: `${baseUrl}/verein/${club.slug}?subscribed=1`,
    cancel_url: `${baseUrl}/verein/${club.slug}?subscribe_cancelled=1`,
    allow_promotion_codes: true,
    locale: "de"
  }, {
    // Idempotenz gegen Doppelklick: zwei identische Checkout-Sessions (selber
    // Club/Plan/Cycle) würden sonst parallel entstehen. Key ist auf die
    // Operation begrenzt; nach 24h (Stripe-Key-TTL) ist ein erneuter Versuch
    // wieder frei.
    idempotencyKey: `checkout-${club.id}-${opts.plan}-${cycle}`
  });

  if (!session.url) {
    throw new Error("Stripe Checkout-Session ohne URL");
  }
  return { url: session.url };
}

/**
 * Öffnet das Stripe-Customer-Portal für Selfservice (Kündigen, Zahlungsmittel ändern,
 * Rechnungs-History). Returns redirect-URL.
 */
export async function createCustomerPortalSession(clubSlug: string): Promise<{ url: string }> {
  if (!isStripeConfigured()) {
    throw new Error("Stripe nicht konfiguriert");
  }
  const { club } = await assertClubAccess(clubSlug, "admin");
  const stripe = getStripe();

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, club.id))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    throw new Error("Kein aktives Abo für diese Mannschaft gefunden.");
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${getBaseUrl()}/verein/${club.slug}`
  });
  return { url: session.url };
}
