import { getStripe } from "@/lib/stripe/client";

/**
 * Operator-Stripe-Operationen für das Backoffice (/admin). Bewusst eng
 * gehalten + idempotent (Stripe-idempotencyKey), weil es um echte
 * Geldbewegungen geht. Die DB wird primär vom Stripe-Webhook synchronisiert
 * (customer.subscription.updated etc.) — diese Helfer lösen nur die Stripe-
 * seitige Änderung aus.
 */

/**
 * Verlängert die Trial-Phase um `days` Tage. Basis ist das bestehende
 * trial_end (falls in der Zukunft), sonst jetzt. proration_behavior=none,
 * damit keine ungewollte Zwischenabrechnung entsteht.
 */
export async function extendTrial(
  stripeSubscriptionId: string,
  days: number
): Promise<{ trialEnd: Date }> {
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const now = Math.floor(Date.now() / 1000);
  const base = sub.trial_end && sub.trial_end > now ? sub.trial_end : now;
  const trialEnd = base + days * 86400;
  await stripe.subscriptions.update(stripeSubscriptionId, {
    trial_end: trialEnd,
    proration_behavior: "none"
  });
  return { trialEnd: new Date(trialEnd * 1000) };
}

export type RefundResult =
  | { ok: true; amountCents: number; refundId: string; invoiceId: string }
  | { ok: false; reason: "no_paid_invoice" | "no_payment" };

/**
 * Erstattet die zuletzt BEZAHLTE Rechnung der Subscription vollständig.
 * idempotencyKey ist an die Invoice-ID gebunden → ein erneuter Klick
 * erzeugt KEINE zweite Erstattung für dieselbe Rechnung.
 */
export async function refundLatestPaidInvoice(
  stripeSubscriptionId: string
): Promise<RefundResult> {
  const stripe = getStripe();
  const invoices = await stripe.invoices.list({
    subscription: stripeSubscriptionId,
    status: "paid",
    limit: 1
  });
  const inv = invoices.data[0];
  if (!inv?.id) return { ok: false, reason: "no_paid_invoice" };

  // Im aktuellen Stripe-API-Schema (dahlia) hängt die Zahlung nicht mehr direkt
  // als invoice.payment_intent, sondern in der InvoicePayments-Liste.
  const payments = await stripe.invoicePayments.list({ invoice: inv.id, limit: 10 });
  const withPi = payments.data.find(
    (p) => p.payment?.type === "payment_intent" && p.payment.payment_intent
  );
  const pi = withPi?.payment.payment_intent;
  const paymentIntentId = typeof pi === "string" ? pi : pi?.id;
  if (!paymentIntentId) return { ok: false, reason: "no_payment" };

  const refund = await stripe.refunds.create(
    { payment_intent: paymentIntentId },
    { idempotencyKey: `operator-refund-${inv.id}` }
  );
  return { ok: true, amountCents: inv.amount_paid, refundId: refund.id, invoiceId: inv.id };
}
