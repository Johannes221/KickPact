"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clubs, subscriptions } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { requireUser } from "@/lib/auth/session";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import {
  getStripePriceId,
  TRIAL_DAYS,
  type PlanKey,
  type BillingCycle
} from "@/lib/stripe/pricing";

const baseUrl = process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

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
   * Billing-Cycle (monthly/season/annual). Falls leer: aus subscriptions.billingCycle,
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
  const cycle: BillingCycle =
    opts.cycle ?? ((existing?.billingCycle as BillingCycle | undefined) ?? "monthly");

  const priceId = getStripePriceId(opts.plan, cycle);
  if (!priceId) {
    throw new Error(
      `Stripe Price-ID für Plan "${opts.plan}" (${cycle}) fehlt. Setze STRIPE_${opts.plan.toUpperCase()}_${cycle.toUpperCase()}_PRICE_ID.`
    );
  }

  let customerId = existing?.stripeCustomerId ?? null;
  const isPlaceholder =
    typeof customerId === "string" && customerId.startsWith("placeholder_");

  if (!customerId || isPlaceholder) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: club.name,
      metadata: { clubId: club.id, clubSlug: club.slug }
    });
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
  const isAppTrial =
    existing?.status === "trialing" &&
    !existing?.stripeSubscriptionId;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    // Explizite Methoden-Liste statt Stripe-Auto-Auswahl: ohne dies zeigt der
    // Checkout ALLE im Dashboard aktivierten Methoden — u.a. Klarna/Sofort, die
    // das wiederkehrende Abo-Modell NICHT unterstützen (Nutzer wählt sie → Fehler).
    // card + sepa_debit + paypal sind recurring-tauglich und decken DE-Amateur-
    // fußball ab. (SEPA/PayPal müssen im Stripe-Dashboard aktiviert sein.)
    payment_method_types: ["card", "sepa_debit", "paypal"],
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      ...(isAppTrial ? { trial_period_days: TRIAL_DAYS } : {}),
      metadata: { clubId: club.id, plan: opts.plan, cycle }
    },
    success_url: `${baseUrl}/verein/${club.slug}?subscribed=1`,
    cancel_url: `${baseUrl}/verein/${club.slug}?subscribe_cancelled=1`,
    allow_promotion_codes: true,
    locale: "de"
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
    return_url: `${baseUrl}/verein/${club.slug}`
  });
  return { url: session.url };
}

/**
 * Convenience: redirect direkt zu Checkout — für Form-Action-Buttons.
 */
export async function startCheckoutAndRedirect(formData: FormData) {
  const clubSlug = String(formData.get("clubSlug"));
  const plan = String(formData.get("plan")) as PlanKey;
  const cycleRaw = formData.get("cycle");
  const cycle =
    cycleRaw === "monthly" || cycleRaw === "season_end" || cycleRaw === "annual"
      ? (cycleRaw as BillingCycle)
      : undefined;
  const { url } = await createCheckoutSession({ clubSlug, plan, cycle });
  redirect(url);
}
