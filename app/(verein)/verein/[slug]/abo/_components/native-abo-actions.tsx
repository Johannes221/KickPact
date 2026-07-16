"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getProducts,
  purchaseAndVerify,
  restoreAndVerify,
  type AppleProduct
} from "@/lib/platform/iap";
import {
  PLANS,
  PLAN_ORDER,
  SELECTABLE_CYCLES,
  CYCLE_LABELS,
  appleProductIdFor,
  plansOfferedForPurchase,
  type PlanKey,
  type BillingCycle
} from "@/lib/stripe/pricing";

/** Alle anwählbaren Produkt-IDs (3 Tiers × Monatlich/Saison) — Preise vorladen. */
const ALL_APPLE_PRODUCT_IDS: string[] = PLAN_ORDER.flatMap((plan) =>
  SELECTABLE_CYCLES.map((cycle) => appleProductIdFor(plan, cycle)).filter(
    (id): id is string => id !== null
  )
);

/**
 * Auto-Renew-Bedingungen je Cycle. Apple 3.1.2 verlangt am Kaufpunkt korrekte
 * Laufzeit + Verlängerungshinweis — und der MUSS zur echten Produktlaufzeit
 * passen (Monatsabo vs. Saison/Jahres-Abo).
 */
const RENEWAL_TERMS: Record<BillingCycle, string> = {
  monthly: "Verlängert sich automatisch um einen Monat, bis du kündigst.",
  season_end:
    "Saison-Pass — verlängert sich automatisch um eine Saison (12 Monate), bis du kündigst."
};

/**
 * Native iOS-Kauf-Oberfläche (StoreKit). ERSETZT die frühere „im Browser
 * buchen"-Sackgasse.
 *
 * Anti-Steering (Apple 3.1.1/3.1.3): KEINE Web-Preise, KEIN Stripe, KEIN Link in
 * den Browser. Preise kommen ausschließlich aus StoreKit (`displayPrice`), nie
 * aus unserer Pricing-Tabelle. Pro Tarif werden Monats- UND Saison-Variante
 * angeboten, sofern StoreKit sie liefert (fehlt ein Produkt in App Store Connect
 * / ist es noch nicht freigegeben, wird die Variante schlicht ausgeblendet).
 */
export function NativeAboActions({
  clubSlug,
  currentPlan,
  subActive
}: {
  clubSlug: string;
  currentPlan: PlanKey;
  /**
   * Läuft aktuell ein zahlender/Trial-Zugang? Dann nur echte Upgrades; bei
   * gekündigt/abgelaufen darf die aktuelle Stufe reaktiviert werden.
   */
  subActive: boolean;
}) {
  // productId → StoreKit-Produkt (inkl. displayPrice). Leer, bis geladen.
  const [products, setProducts] = useState<Record<string, AppleProduct>>({});
  const [loaded, setLoaded] = useState(false);
  /**
   * Grund, warum keine Produkte da sind — die zwei Fälle sehen im UI sonst
   * identisch aus und die Meldung log den Nutzer an:
   * - "plugin": getProducts wirft (App-Version ohne IAPPlugin) → App updaten.
   * - "store": getProducts liefert LEER (Store-seitig nicht kaufbar, z.B.
   *   Paid-Applications-Vertrag nicht aktiv oder Produkt ohne Preis/Metadaten)
   *   → App-Update hilft null.
   */
  const [emptyReason, setEmptyReason] = useState<"plugin" | "store" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProducts(ALL_APPLE_PRODUCT_IDS)
      .then((list) => {
        if (cancelled) return;
        const map: Record<string, AppleProduct> = {};
        for (const p of list) map[p.productId] = p;
        setProducts(map);
        setEmptyReason(list.length === 0 ? "store" : null);
        setLoaded(true);
      })
      .catch(() => {
        // Bridge/Plugin nicht verfügbar → ältere App-Version ohne IAPPlugin.
        if (cancelled) return;
        setEmptyReason("plugin");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const offeredPlans = plansOfferedForPurchase(currentPlan, subActive);

  async function handlePurchase(productId: string) {
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
      {offeredPlans.length > 0 ? (
        <div className="space-y-3">
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            {subActive ? "Upgrade freischalten" : "Plan freischalten"}
          </h3>

          {offeredPlans.map((plan) => {
            // Reaktivieren = aktuelle Stufe erneut buchen (nur möglich, wenn
            // kein aktives Abo läuft — plansOfferedForPurchase garantiert das).
            const isReactivate = plan === currentPlan;

            // Nur Varianten anzeigen, die StoreKit tatsächlich geliefert hat.
            const options = SELECTABLE_CYCLES.map((cycle) => {
              const productId = appleProductIdFor(plan, cycle);
              const product = productId ? products[productId] : undefined;
              return product && productId ? { cycle, productId, product } : null;
            }).filter(
              (
                o
              ): o is {
                cycle: BillingCycle;
                productId: string;
                product: AppleProduct;
              } => o !== null
            );

            return (
              <div
                key={plan}
                className="rounded-2xl bg-white shadow-ios-card p-4 space-y-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display font-bold tracking-tight text-brand-night-navy">
                      {PLANS[plan].label}
                    </span>
                    {isReactivate && (
                      <span className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-dark ring-1 ring-accent/30">
                        Reaktivieren
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-brand-night-navy/60">
                    {PLANS[plan].tagline}
                  </div>
                </div>

                {options.length > 0 ? (
                  <div className="space-y-2">
                    {options.map(({ cycle, productId, product }) => (
                      <div
                        key={productId}
                        className="flex items-center justify-between gap-3 rounded-xl border border-brand-night-navy/10 bg-brand-off-white p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-brand-night-navy">
                            {CYCLE_LABELS[cycle]}
                          </div>
                          <div className="text-base font-bold text-brand-night-navy">
                            {product.displayPrice}
                          </div>
                          <p className="mt-0.5 text-xs leading-relaxed text-brand-night-navy/55">
                            {RENEWAL_TERMS[cycle]}
                          </p>
                        </div>
                        <Button
                          onClick={() => handlePurchase(productId)}
                          disabled={busy !== null}
                          className="shrink-0"
                        >
                          {busy === productId
                            ? "Wird freigeschaltet…"
                            : isReactivate
                              ? "Reaktivieren"
                              : "Freischalten"}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs leading-relaxed text-brand-night-navy/55">
                    {!loaded
                      ? "Preise werden geladen…"
                      : emptyReason === "plugin"
                        ? "Diese App-Version unterstützt In-App-Käufe noch nicht — bitte aktualisiere die KickPact-App."
                        : "Dieser Tarif ist im App Store gerade nicht kaufbar. Ein App-Update hilft hier nicht — bitte später erneut versuchen."}
                  </p>
                )}
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
        <Button variant="outline" onClick={handleRestore} disabled={busy !== null}>
          {busy === "restore" ? "Wird wiederhergestellt…" : "Käufe wiederherstellen"}
        </Button>
      </div>

      {error && (
        <p className="text-sm font-medium text-brand-alert-red" role="alert">
          {error}
        </p>
      )}

      {/* Apple Guideline 3.1.2: am Kaufpunkt Laufzeit + Auto-Renew-Hinweis +
          funktionierende Links zu Nutzungsbedingungen (EULA) und Datenschutz.
          Die konkrete Laufzeit steht pro Variante oben (RENEWAL_TERMS). */}
      {offeredPlans.length > 0 && (
        <p className="text-xs leading-relaxed text-brand-night-navy/55">
          Zahlung über deine Apple-ID. Abos verlängern sich automatisch, bis du
          sie kündigst — Kündigung jederzeit in den iOS-Einstellungen (Apple-ID →
          Abonnements), spätestens 24 Stunden vor Ablauf des laufenden Zeitraums.
          Mit dem Kauf akzeptierst du unsere{" "}
          <Link href="/agb" className="underline">
            Nutzungsbedingungen
          </Link>{" "}
          und{" "}
          <Link href="/datenschutz" className="underline">
            Datenschutzerklärung
          </Link>
          .
        </p>
      )}
    </div>
  );
}
