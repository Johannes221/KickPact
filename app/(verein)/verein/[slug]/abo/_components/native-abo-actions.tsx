"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getProducts,
  purchaseAndVerify,
  restoreAndVerify
} from "@/lib/platform/iap";
import { PLANS, PLAN_ORDER, type PlanKey } from "@/lib/stripe/pricing";

/**
 * Monatliche Apple-Product-IDs pro Tier. Für den In-App-Upsell bieten wir
 * bewusst NUR die Monats-Tarife an (Saison-Pässe bleiben vorerst Web-only) —
 * das hält das StoreKit-Sheet einfach und deckt den Upgrade-Pfad ab.
 */
const MONTHLY_PRODUCT_ID: Record<PlanKey, string> = {
  basic: "kickpact.basic.monthly",
  pro: "kickpact.pro.monthly",
  verein: "kickpact.verein.monthly"
};

/** Alle 6 Produkte vorladen (auch Saison), damit der native Cache warm ist. */
const ALL_APPLE_PRODUCT_IDS = [
  "kickpact.basic.monthly",
  "kickpact.basic.season",
  "kickpact.pro.monthly",
  "kickpact.pro.season",
  "kickpact.verein.monthly",
  "kickpact.verein.season"
];

/**
 * Native iOS-Kauf-Oberfläche. ERSETZT die frühere „im Browser buchen"-Sackgasse.
 *
 * Anti-Steering (Apple 3.1.1/3.1.3): KEINE Web-Preise, KEIN Stripe, KEIN Link in
 * den Browser. Preise kommen ausschließlich aus StoreKit (getProducts) — daher
 * der `displayPrice` aus dem nativen Plugin, nie aus unserer Pricing-Tabelle.
 */
export function NativeAboActions({
  clubSlug,
  currentPlan,
  hasSub
}: {
  clubSlug: string;
  currentPlan: PlanKey;
  hasSub: boolean;
}) {
  // productId → native displayPrice (aus StoreKit). Leer, solange nicht geladen.
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProducts(ALL_APPLE_PRODUCT_IDS)
      .then((products) => {
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of products) map[p.productId] = p.displayPrice;
        setPrices(map);
      })
      .catch(() => {
        // Plugin noch nicht bereit → ohne Preise rendern (graceful).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nur höhere Tiers als der aktuelle Plan als Upgrade-Karten anbieten.
  const currentIdx = PLAN_ORDER.indexOf(currentPlan);
  const upgradePlans = PLAN_ORDER.filter((p) => PLAN_ORDER.indexOf(p) > currentIdx);

  async function handlePurchase(plan: PlanKey) {
    const productId = MONTHLY_PRODUCT_ID[plan];
    setError(null);
    setBusy(productId);
    try {
      await purchaseAndVerify(productId, clubSlug);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kauf fehlgeschlagen.");
      setBusy(null);
    }
  }

  async function handleRestore() {
    setError(null);
    setBusy("restore");
    try {
      await restoreAndVerify(clubSlug);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wiederherstellung fehlgeschlagen.");
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {upgradePlans.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            {hasSub ? "Upgrade freischalten" : "Plan freischalten"}
          </h3>
          {upgradePlans.map((plan) => {
            const productId = MONTHLY_PRODUCT_ID[plan];
            const price = prices[productId] ?? "—";
            return (
              <div
                key={plan}
                className="flex flex-col gap-3 rounded-2xl bg-white shadow-ios-card p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-display font-bold tracking-tight text-brand-night-navy">
                    {PLANS[plan].label}
                  </div>
                  <div className="text-sm text-brand-night-navy/60">
                    {PLANS[plan].tagline}
                  </div>
                  <div className="mt-1 text-base font-semibold text-brand-night-navy">
                    {price}
                  </div>
                </div>
                <Button
                  onClick={() => handlePurchase(plan)}
                  disabled={busy !== null}
                  className="shrink-0"
                >
                  {busy === productId ? "Wird freigeschaltet…" : "Jetzt freischalten"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5">
          <p className="text-sm text-brand-night-navy/80">
            Du nutzt bereits den höchsten Tarif (Vereinslizenz). Es gibt nichts
            weiter freizuschalten.
          </p>
        </div>
      )}

      <div className="rounded-2xl border border-brand-night-navy/15 bg-brand-off-white p-4 md:p-5">
        <p className="mb-3 text-sm text-brand-night-navy/70">
          Schon gekauft? Stelle deine Käufe auf diesem Gerät wieder her.
        </p>
        <Button
          variant="outline"
          onClick={handleRestore}
          disabled={busy !== null}
        >
          {busy === "restore" ? "Wird wiederhergestellt…" : "Käufe wiederherstellen"}
        </Button>
      </div>

      {error && (
        <p className="text-sm font-medium text-brand-alert-red" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
