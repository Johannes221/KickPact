"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  createCheckoutSession,
  createCustomerPortalSession
} from "@/lib/actions/subscriptions";
import type { PlanKey } from "@/lib/stripe/pricing";
import { track } from "@/lib/analytics/track";

interface Props {
  clubSlug: string;
  plan: PlanKey;
  stripeReady: boolean;
  /** Status des bestehenden Abos, oder null wenn noch keines */
  currentStatus: string | null;
}

export function CheckoutButtons({ clubSlug, plan, stripeReady, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);

  const hasSubscription = !!currentStatus;
  const isTrialing = currentStatus === "trialing";

  async function handleCheckout() {
    setBusy("checkout");
    // Conversion-Event vor dem (server-side) Checkout-Aufruf — der ist
    // potentiell lang (Stripe-Roundtrip + Redirect), wir wollen den
    // Funnel-Hit auch bei langsamer Verbindung sehen.
    track("stripe_checkout_started", {
      plan,
      hasSubscription: !!currentStatus,
      isTrialing: currentStatus === "trialing"
    });
    startTransition(async () => {
      try {
        const { url } = await createCheckoutSession({ clubSlug, plan });
        window.location.href = url;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Checkout konnte nicht gestartet werden");
        setBusy(null);
      }
    });
  }

  async function handlePortal() {
    setBusy("portal");
    startTransition(async () => {
      try {
        const { url } = await createCustomerPortalSession(clubSlug);
        window.location.href = url;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Portal konnte nicht geöffnet werden");
        setBusy(null);
      }
    });
  }

  // CTA-Text je nach Subscription-Status
  function checkoutLabel() {
    if (isPending && busy === "checkout") return "Öffne Checkout…";
    if (!stripeReady) return "Stripe nicht aktiv";
    if (isTrialing) return "Zahlungsdaten hinterlegen →";
    if (hasSubscription) return "Plan wechseln →";
    return "Jetzt starten · 30 Tage gratis";
  }

  return (
    <div className="space-y-2">
      <Button
        variant={plan === "pro" ? "accent" : "outline"}
        size="sm"
        className="w-full"
        disabled={!stripeReady || (isPending && busy === "checkout")}
        onClick={handleCheckout}
      >
        {checkoutLabel()}
      </Button>
      {hasSubscription && stripeReady && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          disabled={isPending && busy === "portal"}
          onClick={handlePortal}
        >
          {isPending && busy === "portal" ? "Lade Portal…" : "Abo verwalten →"}
        </Button>
      )}
    </div>
  );
}
