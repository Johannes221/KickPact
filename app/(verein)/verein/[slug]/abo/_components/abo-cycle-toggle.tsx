"use client";

import { useState } from "react";
import {
  PLANS,
  PLAN_ORDER,
  SELECTABLE_CYCLES,
  CYCLE_LABELS,
  CYCLE_SUBLABELS,
  type BillingCycle,
  type PlanKey
} from "@/lib/stripe/pricing";
import { cn } from "@/lib/utils";
import { CheckoutButtons } from "./checkout-buttons";
import { track } from "@/lib/analytics/track";

interface Props {
  clubSlug: string;
  stripeReady: boolean;
  currentStatus: string | null;
  /** Initialer Cycle aus DB (billingCycle der Subscription oder "monthly"). */
  initialCycle: BillingCycle;
}

export function AboCycleToggle({
  clubSlug,
  stripeReady,
  currentStatus,
  initialCycle
}: Props) {
  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);

  return (
    <div className="space-y-4 md:space-y-5">
      {/* Billing-Cycle-Toggle */}
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="Abrechnungs-Intervall"
          className="flex w-full md:w-auto flex-col md:flex-row md:inline-flex items-stretch rounded-2xl bg-white p-1.5 ring-1 ring-brand-neutral/40 shadow-ios-card gap-1 md:gap-0"
        >
          {SELECTABLE_CYCLES.map((c) => {
            const active = c === cycle;
            return (
              <button
                key={c}
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setCycle(c);
                  track("abo_cycle_switched", {
                    cycle: c,
                    surface: "abo_page"
                  });
                }}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-xl px-4 md:px-5 py-2.5 md:py-2 text-sm font-semibold transition-all w-full md:w-auto",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                  active
                    ? "bg-brand-night-navy text-white shadow-ios-card"
                    : "text-brand-night-navy/70 hover:text-brand-night-navy"
                )}
              >
                <span className="flex items-center justify-center gap-1.5 leading-none">
                  <span>{CYCLE_LABELS[c]}</span>
                  {c === "season_end" && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-[0.15rem] text-[0.5rem] font-bold uppercase tracking-wider leading-none",
                        active
                          ? "bg-accent text-white"
                          : "bg-accent/15 text-accent-dark"
                      )}
                    >
                      Empfohlen
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-[0.65rem] font-medium leading-none",
                    active ? "text-white/80" : "text-brand-night-navy/50"
                  )}
                >
                  {CYCLE_SUBLABELS[c]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Plan Cards */}
      <div className="grid gap-3 md:gap-4 md:grid-cols-3 items-stretch">
        {PLAN_ORDER.map((key) => {
          const plan = PLANS[key];
          const price = plan.cycles[cycle];
          return (
            <div
              key={key}
              className={
                "flex flex-col rounded-2xl border p-4 md:p-5 " +
                (key === "pro"
                  ? "border-accent bg-accent/5"
                  : "border-brand-neutral/40 bg-white")
              }
            >
              <div className="flex items-baseline justify-between">
                <h3 className="font-display font-bold text-lg md:text-xl tracking-tight text-brand-night-navy">
                  {plan.label}
                </h3>
                {key === "pro" && (
                  <span className="rounded-full bg-accent text-white text-[0.55rem] uppercase tracking-widest font-bold px-2 py-1">
                    empfohlen
                  </span>
                )}
              </div>
              <div className="mt-2 md:mt-3 flex items-baseline gap-2">
                <span className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
                  {price.display}
                </span>
                <span className="text-xs text-brand-night-navy/60">
                  {price.caption}
                </span>
              </div>
              {price.saveBadge && (
                <span className="mt-1 inline-flex w-fit rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-accent-dark ring-1 ring-accent/30">
                  {price.saveBadge}
                </span>
              )}
              <ul className="mt-3 md:mt-4 flex-1 space-y-1.5 text-xs md:text-sm text-brand-night-navy/80">
                {plan.features.slice(0, 4).map((f) => (
                  <li key={f} className="flex gap-1.5">
                    <span className="text-accent">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 md:mt-5">
                <CheckoutButtons
                  clubSlug={clubSlug}
                  plan={key as PlanKey}
                  stripeReady={stripeReady}
                  currentStatus={currentStatus}
                  cycle={cycle}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
