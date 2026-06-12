"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClock, CalendarDays } from "lucide-react";
import { changeBillingCycle } from "@/lib/actions/billing-cycle";
import type { SponsorBillingCycle } from "@/lib/db/schema/sponsors";

/**
 * Einstellungs-Karte „Abrechnung" (Paket A.5, Spec §1.2): Wahl zwischen
 * monatlicher und Saisonende-Abrechnung. Wechsel jederzeit erlaubt —
 * bereits entstandene Beiträge behalten ihren Abrechnungs-Rhythmus
 * (Snapshot), nur Neues folgt der Wahl.
 */
export function BillingCycleCard({
  currentCycle
}: {
  currentCycle: SponsorBillingCycle;
}) {
  const [cycle, setCycle] = useState<SponsorBillingCycle>(currentCycle);
  const [pending, startTransition] = useTransition();

  function select(next: SponsorBillingCycle) {
    if (next === cycle || pending) return;
    const previous = cycle;
    setCycle(next);
    startTransition(async () => {
      const res = await changeBillingCycle(next);
      if (!res.ok) {
        setCycle(previous);
        toast.error(res.message);
      } else {
        toast.success(
          next === "season_end"
            ? "Umgestellt: eine Rechnung am Saisonende."
            : "Umgestellt: monatliche Rechnung."
        );
      }
    });
  }

  const options: {
    value: SponsorBillingCycle;
    icon: typeof CalendarDays;
    title: string;
    text: string;
  }[] = [
    {
      value: "monthly",
      icon: CalendarDays,
      title: "Monatlich",
      text: "Deine Beiträge werden am Monatsanfang abgerechnet — eine Rechnung pro Monat mit Spielereignissen."
    },
    {
      value: "season_end",
      icon: CalendarClock,
      title: "Saisonende",
      text: "Alle Beiträge der Saison sammeln sich auf einer Rechnung am 30.06. — eine Überweisung pro Saison."
    }
  ];

  return (
    <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-4">
      <div>
        <h2 className="title-wrap text-lg font-semibold text-brand-night-navy">
          Abrechnung
        </h2>
        <p className="mt-0.5 text-xs text-brand-night-navy/60">
          Wann sollen deine Beiträge abgerechnet werden? Du kannst jederzeit
          wechseln — bereits abgerechnete Beiträge bleiben unverändert.
        </p>
      </div>

      <div role="radiogroup" aria-label="Abrechnungs-Rhythmus" className="space-y-2">
        {options.map((opt) => {
          const selected = cycle === opt.value;
          const Icon = opt.icon;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={pending}
              onClick={() => select(opt.value)}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
                selected
                  ? "border-accent bg-accent/5"
                  : "border-brand-neutral/40 bg-brand-off-white hover:border-accent/40"
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  selected
                    ? "bg-accent/15 text-accent-dark"
                    : "bg-brand-neutral/20 text-brand-night-navy/50"
                }`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-brand-night-navy">
                  {opt.title}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-brand-night-navy/60">
                  {opt.text}
                </span>
              </span>
              <span
                aria-hidden
                className={`ml-auto mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                  selected ? "border-accent bg-accent" : "border-brand-neutral/50"
                }`}
              />
            </button>
          );
        })}
      </div>

      <p className="text-[0.7rem] leading-relaxed text-brand-night-navy/50">
        Wechsel auf Monatlich: bisher gesammelte Beiträge stehen auf deiner
        nächsten Monatsrechnung. Wechsel auf Saisonende: ab sofort sammeln
        sich neue Beiträge bis zum 30.06.
      </p>
    </section>
  );
}
