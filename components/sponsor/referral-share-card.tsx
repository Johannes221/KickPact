"use client";
import { Button } from "@/components/ui/button";

import { useState } from "react";
import { Gift, Copy, Check, Share2 } from "lucide-react";
import { track } from "@/lib/analytics/track";
import { referralShareText } from "@/lib/referral/link";

/**
 * Community-warmer Referral-Hook im Sponsor-Dashboard: lädt den Sponsor ein,
 * KickPact an andere Vereine weiterzugeben. Keine Belohnung, kein Druck —
 * bewusst „gönnen"/Community-Ton (vgl. Positionierungs-Philosophie).
 */
export function ReferralShareCard({ shareUrl }: { shareUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      track("referral_share_click", { method: "copy" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard kann blockiert sein — kein Crash.
    }
  }

  async function handleShare() {
    const text = referralShareText(shareUrl);
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "KickPact", text, url: shareUrl });
        track("referral_share_click", { method: "share" });
      } catch {
        // User hat abgebrochen — nichts tun.
      }
    } else {
      void handleCopy();
    }
  }

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-dark">
          <Gift className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <h2 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            Kennst du einen Verein, dem das auch helfen würde?
          </h2>
          <p className="text-sm leading-relaxed text-brand-night-navy/70">
            Gib KickPact weiter — an den Verein deines Kindes, die Mannschaft vom
            Nachbarn, deinen alten Club. In 2 Minuten startklar, die Mannschaftskasse
            freut sich.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-white px-3 py-2 text-sm font-semibold text-accent-dark hover:bg-accent/10"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" aria-hidden /> Kopiert!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" aria-hidden /> Link kopieren
                </>
              )}
            </button>
            {canNativeShare && (
              <Button variant="accent" size="sm" onClick={handleShare}>
                <Share2 className="h-4 w-4" aria-hidden /> Teilen
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
