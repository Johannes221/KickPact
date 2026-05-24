"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, X, Infinity as InfinityIcon } from "lucide-react";

import {
  PLANS,
  PLAN_ORDER,
  CYCLE_ORDER,
  CYCLE_LABELS,
  CYCLE_SUBLABELS,
  DEFAULT_CYCLE,
  type BillingCycle,
  type PlanKey
} from "@/lib/stripe/pricing";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Comparison-Matrix-Daten (aus docs/pricing.md §5 abgeleitet, redaktionell
// gekürzt für die Pricing-Page). 3 Spalten, gruppiert nach Kategorien.
// ---------------------------------------------------------------------------

type Cell = boolean | string | number | "infinity";

interface MatrixRow {
  label: string;
  values: Record<PlanKey, Cell>;
  /** Optionaler Sub-Hinweis pro Zelle (z.B. "v2"). */
  hints?: Partial<Record<PlanKey, string>>;
}

interface MatrixGroup {
  title: string;
  rows: MatrixRow[];
}

const MATRIX: MatrixGroup[] = [
  {
    title: "Trigger",
    rows: [
      {
        label: "Auto-Trigger (10 Typen)",
        values: { basic: true, pro: true, verein: true }
      },
      {
        label: "Manual-Trigger Katalog",
        values: { basic: true, pro: true, verein: true }
      },
      {
        label: "Saison-Wetten (6 Typen)",
        values: { basic: false, pro: true, verein: true }
      },
      {
        label: "Custom-Trigger-Texte",
        values: { basic: false, pro: true, verein: true }
      }
    ]
  },
  {
    title: "Limits",
    rows: [
      {
        label: "Mannschaften",
        values: { basic: 1, pro: 1, verein: "infinity" }
      },
      {
        label: "Sponsoren pro Mannschaft",
        values: { basic: 5, pro: "infinity", verein: "infinity" }
      },
      {
        label: "Pledge-Rules pro Sponsor",
        values: { basic: 3, pro: "infinity", verein: "infinity" }
      },
      {
        label: "Match-Historie",
        values: { basic: "Akt. Saison", pro: "infinity", verein: "infinity" }
      },
      {
        label: "Admin-User",
        values: { basic: 1, pro: 3, verein: 10 }
      }
    ]
  },
  {
    title: "Branding",
    rows: [
      {
        label: "PDF-Footer",
        values: {
          basic: "KickPact",
          pro: "Vereins-Logo",
          verein: "Vereins-Logo + Sammel-PDF"
        }
      },
      {
        label: "Mail-Absender",
        values: { basic: "KickPact", pro: "Verein", verein: "Verein" }
      },
      {
        label: "Custom-Domain",
        values: { basic: false, pro: false, verein: true },
        hints: { verein: "v2" }
      }
    ]
  },
  {
    title: "Akquise",
    rows: [
      {
        label: "Einladungslinks",
        values: { basic: true, pro: true, verein: true }
      },
      {
        label: "Pledge-Discovery (öffentl. Profil)",
        values: { basic: false, pro: true, verein: true }
      },
      {
        label: "Embed-Widget Vereinswebsite",
        values: { basic: false, pro: true, verein: true }
      },
      {
        label: "Auto-Sponsor-Newsletter",
        values: { basic: false, pro: true, verein: true }
      }
    ]
  },
  {
    title: "Analytics",
    rows: [
      {
        label: "Sponsor-Stats-Widgets",
        values: { basic: false, pro: true, verein: true }
      },
      {
        label: "CSV/Excel-Export",
        values: { basic: false, pro: true, verein: true }
      },
      {
        label: "Saison-Recap-PDF (Mannschaft)",
        values: { basic: false, pro: true, verein: true }
      },
      {
        label: "Saison-Recap-PDF (Verein-aggregiert)",
        values: { basic: false, pro: false, verein: true }
      }
    ]
  },
  {
    title: "Verein-Verwaltung",
    rows: [
      {
        label: "Master-Admin-Cockpit",
        values: { basic: false, pro: false, verein: true }
      },
      {
        label: "Konsolidierte Sammelrechnung",
        values: { basic: false, pro: false, verein: true }
      },
      {
        label: "Cross-Team-Sponsor-View",
        values: { basic: false, pro: false, verein: true }
      }
    ]
  },
  {
    title: "Support",
    rows: [
      {
        label: "Support-Kanal",
        values: { basic: "Email", pro: "Email", verein: "Email + WhatsApp" }
      },
      {
        label: "SLA",
        values: { basic: "48 h", pro: "24 h", verein: "4 h" }
      },
      {
        label: "Self-Service Help-Center",
        values: { basic: true, pro: true, verein: true }
      }
    ]
  }
];

// ---------------------------------------------------------------------------
// Toggle + Cards + Matrix als ein Client-Bundle, da der Toggle-State sowohl
// die Cards als auch (optional) später die Matrix steuern könnte.
// ---------------------------------------------------------------------------

export function PricingToggle() {
  const [cycle, setCycle] = useState<BillingCycle>(DEFAULT_CYCLE);

  return (
    <>
      {/* Billing-Cycle-Toggle */}
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="Abrechnungs-Intervall"
          className="inline-flex flex-col sm:flex-row items-stretch rounded-2xl bg-white p-1.5 ring-1 ring-brand-neutral/40 shadow-sm gap-1 sm:gap-0"
        >
          {CYCLE_ORDER.map((c) => {
            const active = c === cycle;
            return (
              <button
                key={c}
                role="tab"
                aria-selected={active}
                onClick={() => setCycle(c)}
                className={cn(
                  "relative inline-flex items-center justify-center gap-2 rounded-xl px-4 sm:px-5 py-2.5 text-sm font-semibold transition-all",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
                  active
                    ? "bg-brand-night-navy text-white shadow-sm"
                    : "text-brand-night-navy/70 hover:text-brand-night-navy"
                )}
              >
                <span className="flex flex-col items-center sm:flex-row sm:gap-2">
                  <span className="leading-none">{CYCLE_LABELS[c]}</span>
                  <span
                    className={cn(
                      "text-[0.65rem] font-medium leading-none mt-0.5 sm:mt-0",
                      active ? "text-white/80" : "text-brand-night-navy/50"
                    )}
                  >
                    {CYCLE_SUBLABELS[c]}
                  </span>
                </span>
                {c === "season" && (
                  <span
                    className={cn(
                      "absolute -top-2 right-2 rounded-full px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider",
                      active
                        ? "bg-accent text-white"
                        : "bg-accent/15 text-accent-dark"
                    )}
                  >
                    Empfohlen
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="mt-10 md:mt-12 grid gap-6 md:gap-8 md:grid-cols-3 items-stretch">
        {PLAN_ORDER.map((key) => (
          <PriceCard key={key} planKey={key} cycle={cycle} />
        ))}
      </div>

      <p className="mt-6 md:mt-8 text-center text-xs md:text-sm text-brand-night-navy/60 max-w-2xl mx-auto">
        Alle Preise zzgl. USt. (19 %). Monatlich kündbar. Saison-Pass mit
        kostenloser Sommerpause (Juni/Juli). Trial 30 Tage, keine Kreditkarte
        beim Start.
      </p>

      {/* Comparison Matrix */}
      <div className="mt-16 md:mt-24">
        <ComparisonMatrix cycle={cycle} />
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PriceCard
// ---------------------------------------------------------------------------

function PriceCard({
  planKey,
  cycle
}: {
  planKey: PlanKey;
  cycle: BillingCycle;
}) {
  const plan = PLANS[planKey];
  const price = plan.cycles[cycle];
  const isPro = planKey === "pro";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-2xl border p-6 md:p-8 transition-shadow",
        isPro
          ? "border-accent bg-white shadow-xl shadow-accent/15 md:scale-[1.03] ring-1 ring-accent/40"
          : "border-brand-neutral/40 bg-white hover:shadow-md"
      )}
    >
      {isPro && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="rounded-full bg-accent text-white text-[0.6rem] uppercase tracking-[0.18em] font-bold px-3 py-1 shadow-sm">
            Empfohlen
          </span>
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
            {plan.label}
          </h3>
          {price.saveBadge && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider text-accent-dark ring-1 ring-accent/30">
              {price.saveBadge}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs md:text-sm font-medium text-brand-night-navy/60">
          {plan.tagline}
        </p>

        <div className="mt-5 md:mt-6 flex items-baseline gap-2 tabular-nums">
          <span className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
            {price.display}
          </span>
          <span className="text-xs md:text-sm text-brand-night-navy/60">
            {price.caption}
          </span>
        </div>

        {plan.note && (
          <p className="mt-2 text-[0.7rem] md:text-xs font-semibold text-accent-dark">
            {plan.note}
          </p>
        )}
      </div>

      <ul className="mt-5 md:mt-6 flex-1 space-y-2 md:space-y-2.5 text-xs md:text-sm">
        {plan.features.map((f, idx) => (
          <li
            key={f}
            className={cn(
              "flex gap-2 text-brand-night-navy/85",
              idx === 0 && f.endsWith("plus:") && "font-semibold"
            )}
          >
            {f.endsWith("plus:") ? (
              <span className="text-accent/0 select-none" aria-hidden>
                +
              </span>
            ) : (
              <Check
                className="h-4 w-4 md:h-5 md:w-5 mt-0.5 shrink-0 text-accent"
                aria-hidden
              />
            )}
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 md:mt-8">
        <Button
          variant={isPro ? "accent" : "outline"}
          className="w-full"
          size="lg"
          asChild
        >
          <Link href={`/onboarding/verein/1?plan=${planKey}&cycle=${cycle}`}>
            {plan.cta}
          </Link>
        </Button>
        <p className="mt-3 text-center text-[0.65rem] font-semibold uppercase tracking-wider text-brand-night-navy/50">
          30 Tage gratis · 0 % Provision
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Comparison Matrix — Desktop = Tabelle, Mobile = Card pro Tier
// ---------------------------------------------------------------------------

function ComparisonMatrix({ cycle }: { cycle: BillingCycle }) {
  return (
    <div>
      <div className="text-center max-w-2xl mx-auto">
        <h2 className="font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
          Was ist <span className="text-accent">in welchem Tarif?</span>
        </h2>
        <p className="mt-3 text-sm md:text-base text-brand-night-navy/65">
          Komplette Featurematrix. Pro-Spalte hervorgehoben — hier landen die
          meisten Vereine.
        </p>
      </div>

      {/* Desktop / Tablet */}
      <div className="mt-10 hidden md:block">
        <DesktopMatrix cycle={cycle} />
      </div>

      {/* Mobile */}
      <div className="mt-10 md:hidden space-y-5">
        {PLAN_ORDER.map((key) => (
          <MobileMatrixCard key={key} planKey={key} cycle={cycle} />
        ))}
      </div>
    </div>
  );
}

function DesktopMatrix({ cycle }: { cycle: BillingCycle }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-brand-neutral/40 bg-brand-off-white">
            <th className="w-1/3 px-5 py-4 text-left font-display font-black text-base text-brand-night-navy">
              Feature
            </th>
            {PLAN_ORDER.map((key) => {
              const plan = PLANS[key];
              const price = plan.cycles[cycle];
              const isPro = key === "pro";
              return (
                <th
                  key={key}
                  className={cn(
                    "w-[22%] px-4 py-4 text-left align-bottom",
                    isPro && "bg-accent/5"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-display font-black text-base text-brand-night-navy">
                      {plan.label}
                    </span>
                    {isPro && (
                      <span className="rounded-full bg-accent text-white text-[0.55rem] uppercase tracking-wider font-bold px-1.5 py-0.5">
                        Beliebt
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-brand-night-navy/70 tabular-nums">
                    {price.display}{" "}
                    <span className="font-normal text-brand-night-navy/50">
                      {price.caption}
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {MATRIX.map((group, gi) => (
            <GroupRows key={group.title} group={group} isFirst={gi === 0} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  isFirst
}: {
  group: MatrixGroup;
  isFirst: boolean;
}) {
  return (
    <>
      <tr className={cn(!isFirst && "border-t-4 border-brand-off-white")}>
        <td
          colSpan={4}
          className="bg-brand-off-white px-5 py-2.5 text-[0.65rem] uppercase tracking-[0.18em] font-bold text-brand-night-navy/70"
        >
          {group.title}
        </td>
      </tr>
      {group.rows.map((row) => (
        <tr
          key={row.label}
          className="border-t border-brand-neutral/25 hover:bg-brand-off-white/50"
        >
          <td className="px-5 py-3 text-brand-night-navy/85">{row.label}</td>
          {PLAN_ORDER.map((key) => {
            const isPro = key === "pro";
            return (
              <td
                key={key}
                className={cn("px-4 py-3", isPro && "bg-accent/5")}
              >
                <CellRender
                  value={row.values[key]}
                  hint={row.hints?.[key]}
                  emphasize={isPro}
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function CellRender({
  value,
  hint,
  emphasize
}: {
  value: Cell;
  hint?: string;
  emphasize?: boolean;
}) {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Check
          className="h-4 w-4 text-accent shrink-0"
          aria-hidden
        />
        <span className="sr-only">Enthalten</span>
        {hint && (
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-brand-night-navy/50">
            {hint}
          </span>
        )}
      </span>
    );
  }
  if (value === false) {
    return (
      <>
        <X
          className="h-4 w-4 text-brand-neutral shrink-0"
          aria-hidden
        />
        <span className="sr-only">Nicht enthalten</span>
      </>
    );
  }
  if (value === "infinity") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 font-display font-black tabular-nums",
          emphasize ? "text-accent" : "text-brand-night-navy"
        )}
      >
        <InfinityIcon className="h-4 w-4" aria-hidden />
        <span className="sr-only">unbegrenzt</span>
        {hint && (
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-brand-night-navy/50">
            {hint}
          </span>
        )}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        emphasize ? "text-brand-night-navy" : "text-brand-night-navy/85"
      )}
    >
      {value}
      {hint && (
        <span className="ml-1 text-[0.65rem] font-semibold uppercase tracking-wider text-brand-night-navy/50">
          {hint}
        </span>
      )}
    </span>
  );
}

function MobileMatrixCard({
  planKey,
  cycle
}: {
  planKey: PlanKey;
  cycle: BillingCycle;
}) {
  const plan = PLANS[planKey];
  const price = plan.cycles[cycle];
  const isPro = planKey === "pro";

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white",
        isPro
          ? "border-accent ring-1 ring-accent/30 shadow-md shadow-accent/10"
          : "border-brand-neutral/40"
      )}
    >
      <div className="flex items-baseline justify-between gap-2 px-5 py-4 border-b border-brand-neutral/30">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-display font-black text-xl text-brand-night-navy">
              {plan.label}
            </h3>
            {isPro && (
              <span className="rounded-full bg-accent text-white text-[0.55rem] uppercase tracking-wider font-bold px-1.5 py-0.5">
                Beliebt
              </span>
            )}
          </div>
          <div className="text-xs text-brand-night-navy/60 tabular-nums">
            <strong className="text-brand-night-navy">{price.display}</strong>{" "}
            {price.caption}
          </div>
        </div>
      </div>

      <div className="divide-y divide-brand-neutral/25">
        {MATRIX.map((group) => (
          <div key={group.title} className="px-5 py-4">
            <div className="text-[0.6rem] uppercase tracking-[0.18em] font-bold text-brand-night-navy/55">
              {group.title}
            </div>
            <dl className="mt-2 space-y-1.5">
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <dt className="text-brand-night-navy/80">{row.label}</dt>
                  <dd className="text-right">
                    <MobileCell
                      value={row.values[planKey]}
                      hint={row.hints?.[planKey]}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}

function MobileCell({ value, hint }: { value: Cell; hint?: string }): ReactNode {
  if (value === true) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-accent-dark">
        <Check className="h-3.5 w-3.5" aria-hidden />
        <span>Ja</span>
        {hint && (
          <span className="text-[0.6rem] uppercase tracking-wider text-brand-night-navy/50">
            ({hint})
          </span>
        )}
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center gap-1 text-brand-night-navy/40">
        <X className="h-3.5 w-3.5" aria-hidden />
        <span>—</span>
      </span>
    );
  }
  if (value === "infinity") {
    return (
      <span className="inline-flex items-center gap-1 font-bold tabular-nums text-accent-dark">
        <InfinityIcon className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">unbegrenzt</span>
      </span>
    );
  }
  return (
    <span className="font-semibold tabular-nums text-brand-night-navy">
      {value}
      {hint && (
        <span className="ml-1 text-[0.6rem] uppercase tracking-wider text-brand-night-navy/50">
          ({hint})
        </span>
      )}
    </span>
  );
}
