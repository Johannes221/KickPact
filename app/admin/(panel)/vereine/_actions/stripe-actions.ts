"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { isStripeConfigured } from "@/lib/stripe/client";
import { extendTrial, refundLatestPaidInvoice } from "@/lib/stripe/admin-ops";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import {
  getClubWithSubscriptionBySlug,
  setSubscriptionTrialEnd
} from "@/lib/db/queries/club-admin";
import { eur } from "@/lib/utils/currency";

const extendSchema = z.object({
  clubSlug: z.string().min(1),
  days: z.number().int().min(1).max(60)
});

export async function extendTrialAction(input: { clubSlug: string; days: number }) {
  const parsed = extendSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  if (!isStripeConfigured()) return { ok: false as const, error: "Stripe ist nicht konfiguriert." };
  const { user: admin } = await assertPlatformAdmin();

  const club = await getClubWithSubscriptionBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };
  if (!club.stripeSubscriptionId) {
    return { ok: false as const, error: "Kein Stripe-Abo für diesen Verein." };
  }

  let trialEnd: Date;
  try {
    ({ trialEnd } = await extendTrial(club.stripeSubscriptionId, parsed.data.days));
  } catch (e) {
    console.error("[stripe] extendTrial failed", e);
    return { ok: false as const, error: "Stripe-Fehler beim Verlängern der Trial." };
  }

  // Optimistisch lokal spiegeln; der Webhook (subscription.updated) bestätigt.
  await setSubscriptionTrialEnd(club.clubId, trialEnd);

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "stripe.extend_trial",
    targetType: "subscription",
    targetId: club.clubId,
    summary: `Trial verlängert um ${parsed.data.days} Tage (${club.clubName}) → ${trialEnd.toLocaleDateString("de-DE")}`,
    diff: { days: parsed.data.days, trialEnd: trialEnd.toISOString() }
  });

  revalidatePath(`/admin/vereine/${club.clubSlug}`);
  return { ok: true as const };
}

export async function refundLatestAction(input: { clubSlug: string }) {
  const parsed = z.object({ clubSlug: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  if (!isStripeConfigured()) return { ok: false as const, error: "Stripe ist nicht konfiguriert." };
  const { user: admin } = await assertPlatformAdmin();

  const club = await getClubWithSubscriptionBySlug(parsed.data.clubSlug);
  if (!club) return { ok: false as const, error: "Verein nicht gefunden" };
  if (!club.stripeSubscriptionId) {
    return { ok: false as const, error: "Kein Stripe-Abo für diesen Verein." };
  }

  let result;
  try {
    result = await refundLatestPaidInvoice(club.stripeSubscriptionId);
  } catch (e) {
    console.error("[stripe] refund failed", e);
    return { ok: false as const, error: "Stripe-Fehler bei der Erstattung." };
  }
  if (!result.ok) {
    return {
      ok: false as const,
      error:
        result.reason === "no_paid_invoice"
          ? "Keine bezahlte Rechnung zum Erstatten gefunden."
          : "Zur letzten Rechnung wurde keine Zahlung gefunden."
    };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "stripe.refund",
    targetType: "subscription",
    targetId: club.clubId,
    summary: `Erstattung ${eur(result.amountCents)} (${club.clubName}, Rechnung ${result.invoiceId})`,
    diff: { amountCents: result.amountCents, refundId: result.refundId, invoiceId: result.invoiceId }
  });

  revalidatePath(`/admin/vereine/${club.clubSlug}`);
  return { ok: true as const, amount: eur(result.amountCents) };
}
