"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  extendTrialAction,
  refundLatestAction
} from "@/app/admin/(panel)/vereine/_actions/stripe-actions";

export function StripeClubActions({
  clubSlug,
  hasStripeSub,
  stripeConfigured
}: {
  clubSlug: string;
  hasStripeSub: boolean;
  stripeConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  if (!stripeConfigured) {
    return <p className="text-xs text-brand-night-navy/50">Stripe ist nicht konfiguriert.</p>;
  }
  if (!hasStripeSub) {
    return <p className="text-xs text-brand-night-navy/50">Kein Stripe-Abo verknüpft.</p>;
  }

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; amount?: string }>, msg: string) {
    setPending(key);
    const res = await fn();
    setPending(null);
    if (res.ok) {
      toast.success(res.amount ? `${msg}: ${res.amount}` : msg);
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending !== null}
        onClick={() => run("t14", () => extendTrialAction({ clubSlug, days: 14 }), "Trial +14 Tage")}
      >
        Trial +14 T
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending !== null}
        onClick={() => run("t30", () => extendTrialAction({ clubSlug, days: 30 }), "Trial +30 Tage")}
      >
        Trial +30 T
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending !== null}
        onClick={() => {
          if (!window.confirm("Letzte bezahlte Rechnung VOLLSTÄNDIG erstatten? Das ist nicht reversibel."))
            return;
          run("refund", () => refundLatestAction({ clubSlug }), "Erstattet");
        }}
      >
        {pending === "refund" ? "Erstatte..." : "Letzte Zahlung erstatten"}
      </Button>
    </div>
  );
}
