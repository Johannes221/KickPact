"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { PlanKey } from "@/lib/stripe/pricing";
import { FEATURE_BY_PLAN } from "@/lib/billing/plan-features-catalog";
import { getCheckoutChannel } from "@/lib/billing/checkout-channel";
import { purchaseAndVerify } from "@/lib/platform/iap";
import { createCheckoutSession } from "@/lib/actions/subscriptions";
import { Button } from "@/components/ui/button";

type Trigger = "cap" | "trial" | "readonly";

const PRODUCT_BY_PLAN: Record<PlanKey, string> = {
  basic: "kickpact.basic.monthly",
  pro: "kickpact.pro.monthly",
  verein: "kickpact.verein.monthly"
};

/**
 * Part B — channel-aware Upgrade-Aufforderung. iOS → StoreKit-Sheet (nativ),
 * Web → Stripe-Checkout. Auf iOS werden bewusst KEINE Web-Preise gezeigt
 * (Apple Anti-Steering); die Preise kommen dort aus dem nativen Sheet.
 *
 * `trigger` dokumentiert den Auslöser (Cap erreicht / Trial-Ende / Read-Only)
 * für späteres Tracking + ggf. abweichende Texte; die Verdrahtung an die drei
 * Stellen erfolgt in einem Folge-Task.
 */
export function UpgradeGate(props: {
  targetPlan: PlanKey;
  trigger: Trigger;
  clubSlug?: string;
}) {
  const { targetPlan, clubSlug } = props;
  const feature = FEATURE_BY_PLAN[targetPlan];
  const channel = getCheckoutChannel();
  const [busy, setBusy] = useState(false);

  async function onUpgrade() {
    setBusy(true);
    try {
      if (channel === "apple") {
        if (!clubSlug) return;
        await purchaseAndVerify(PRODUCT_BY_PLAN[targetPlan], clubSlug);
        window.location.reload();
      } else if (clubSlug) {
        const { url } = await createCheckoutSession({
          clubSlug,
          plan: targetPlan,
          cycle: "monthly"
        });
        window.location.href = url;
      }
    } catch (e) {
      // Stripe-/StoreKit-Fehler nicht still scheitern lassen (kein unhandled
      // rejection, sichtbares Feedback).
      toast.error(
        e instanceof Error ? e.message : "Upgrade fehlgeschlagen — bitte erneut versuchen."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
      <h3 className="text-lg font-semibold">{feature.upgradeHeadline}</h3>
      <ul className="mt-3 space-y-1 text-sm text-neutral-700">
        {feature.highlights.map((h) => (
          <li key={h}>• {h}</li>
        ))}
      </ul>
      <Button className="mt-4" onClick={onUpgrade} disabled={busy}>
        {channel === "apple" ? "Jetzt freischalten" : "Upgrade wählen"}
      </Button>
    </div>
  );
}
