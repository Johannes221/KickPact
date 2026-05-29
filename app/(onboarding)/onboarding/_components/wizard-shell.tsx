import Link from "next/link";
import { cn } from "@/lib/utils";

const STEPS_LABELS = ["Verein & Mannschaft", "Stammdaten", "Sponsoren einladen"] as const;

interface Props {
  step: 1 | 2 | 3;
  role: "mannschaft" | "verein";
  children: React.ReactNode;
  /** Optionaler „← Zurück"-Link zum vorherigen Step. */
  backHref?: string;
}

/**
 * Shared 3-Step Wizard-Shell. Server-Component — kein State, kein Hook.
 * Wird von `/onboarding/{mannschaft|verein}/{verein|stammdaten|sponsoren}/page.tsx`
 * gemountet.
 *
 * Tabs sind read-only (Klick navigiert NICHT zurück) — Resume regelt der
 * Dispatcher, freie Navigation würde die State-Machine umgehen.
 */
export function WizardShell({ step, role, children, backHref }: Props) {
  const headline = role === "verein" ? "Verein anlegen" : "Mannschaft anlegen";
  const subline =
    role === "verein"
      ? "3 Schritte, ca. 3 Minuten. Du startest direkt in 30 Tagen Vereinslizenz-Trial — keine Kreditkarte."
      : "3 Schritte, ca. 3 Minuten. Du startest direkt in 30 Tagen Pro-Trial — keine Kreditkarte.";

  return (
    <main className="mx-auto max-w-3xl px-5 md:px-6 py-8 md:py-12">
      {backHref && (
        <div className="mb-3">
          <Link
            href={backHref}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-night-navy/60 hover:text-brand-night-navy transition-colors"
          >
            ← Zurück
          </Link>
        </div>
      )}
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          {headline}
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
          {subline}
        </p>
      </div>

      <ol className="mb-8 md:mb-12 flex gap-2">
        {STEPS_LABELS.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3;
          const done = stepNum < step;
          const active = stepNum === step;
          return (
            <li key={label} className="flex-1">
              <div
                className={cn(
                  "rounded-xl border px-3 py-2 md:px-4 md:py-3 transition-colors",
                  active && "border-accent bg-accent/10",
                  done && "border-accent/40 bg-accent/5",
                  !active && !done && "border-brand-neutral/30 bg-brand-off-white"
                )}
              >
                <div
                  className={cn(
                    "text-[0.6rem] md:text-xs font-bold uppercase tracking-widest",
                    active ? "text-accent-dark" : "text-brand-night-navy/40"
                  )}
                >
                  Schritt {stepNum}
                </div>
                <div
                  className={cn(
                    "mt-0.5 text-xs md:text-sm font-semibold truncate",
                    active ? "text-brand-night-navy" : "text-brand-night-navy/60"
                  )}
                >
                  {label}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {children}
    </main>
  );
}
