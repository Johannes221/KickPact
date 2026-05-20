"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  createCheckoutSession,
  createCustomerPortalSession
} from "@/lib/actions/subscriptions";
import type { PlanKey } from "@/lib/stripe/pricing";

interface Props {
  clubSlug: string;
  plan: PlanKey;
  stripeReady: boolean;
  hasSubscription: boolean;
}

export function CheckoutButtons({ clubSlug, plan, stripeReady, hasSubscription }: Props) {
  const [isPending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);

  async function handleCheckout() {
    setBusy("checkout");
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

  return (
    <div className="space-y-2">
      <Button
        variant={plan === "pro" ? "accent" : "outline"}
        size="sm"
        className="w-full"
        disabled={!stripeReady || (isPending && busy === "checkout")}
        onClick={handleCheckout}
      >
        {isPending && busy === "checkout"
          ? "Öffne Checkout…"
          : stripeReady
            ? "Jetzt starten · 30 Tage gratis"
            : "Stripe nicht aktiv"}
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
