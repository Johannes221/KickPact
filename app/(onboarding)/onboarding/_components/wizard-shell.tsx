import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";

const STEPS_LABELS = ["Verein & Mannschaft", "Stammdaten"] as const;

interface Props {
  step: 1 | 2;
  role: "mannschaft" | "verein";
  children: React.ReactNode;
  /**
   * Dezenter Kontext oben (z.B. der User-Name). Ersetzt den früheren klobigen
   * Top-Zurück-Button als primären „Wo bin ich?"-Anker.
   */
  userContext?: string;
  /**
   * Ziel des Zurück-Links. Wenn gesetzt, erscheint links oben ein dezenter
   * „Zurück"-Pfeil (Step 2 → Step 1). Auf Step 1 weggelassen.
   */
  backHref?: string;
}

/**
 * Shared 2-Step Wizard-Shell. Server-Component — kein State, kein Hook.
 * Wird von `/onboarding/{mannschaft|verein}/{verein|stammdaten}/page.tsx`
 * gemountet. Nach Schritt 2 (Stammdaten) wird direkt abgeschlossen und ins
 * Dashboard geleitet.
 *
 * Clean/native Styling: System-/Sans-Font statt Display-Black, ein einziger
 * `<PageHeader>`-Titel, dezenter User-Kontext oben (kein klobiger Zurück-Button
 * mehr) und eine schlanke, klickbare Step-Leiste. Bereits abgeschlossene Steps
 * sind als Link zurück erreichbar (Step 1 ↔ Step 2), zukünftige Steps sind
 * inert — die State-Machine bleibt die Quelle der Wahrheit.
 */
export function WizardShell({ step, role, children, userContext, backHref }: Props) {
  const headline = role === "verein" ? "Verein anlegen" : "Mannschaft anlegen";
  const subline =
    role === "verein"
      ? "2 Schritte, ca. 2 Minuten — 30 Tage Vereinslizenz-Trial, keine Kreditkarte."
      : "2 Schritte, ca. 2 Minuten — 30 Tage Pro-Trial, keine Kreditkarte.";

  return (
    <main className="mx-auto max-w-2xl px-5 pb-16 pt-4 md:px-6 md:pt-8">
      {/* Dezente Top-Zeile: Zurück-Pfeil (nur wenn sinnvoll) links, Kontext rechts. */}
      <div className="mb-5 flex min-h-7 items-center justify-between gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className="-ml-1 inline-flex items-center gap-1.5 rounded-full px-1.5 py-1 text-[15px] font-medium text-brand-night-navy/60 transition-colors hover:text-brand-night-navy"
          >
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden />
            Zurück
          </Link>
        ) : (
          <span aria-hidden />
        )}
        {userContext ? (
          <span className="truncate text-[13px] font-medium text-brand-night-navy/45">
            {userContext}
          </span>
        ) : null}
      </div>

      <PageHeader title={headline} subtitle={subline} />

      {/* Schlanke Step-Leiste: erledigte Steps sind klickbare Links zurück. */}
      <ol className="mb-8 mt-7 flex items-center gap-2">
        {STEPS_LABELS.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2;
          const done = stepNum < step;
          const active = stepNum === step;
          // Nur erledigte Steps sind als Zurück-Link erreichbar.
          const href = done && backHref ? backHref : undefined;

          const inner = (
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-colors",
                  active && "bg-accent text-white",
                  done && "bg-accent/15 text-accent-dark",
                  !active && !done && "bg-brand-neutral/15 text-brand-night-navy/40"
                )}
              >
                {done ? <Check className="h-4 w-4" aria-hidden /> : stepNum}
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  active
                    ? "text-brand-night-navy"
                    : done
                      ? "text-brand-night-navy/70"
                      : "text-brand-night-navy/40"
                )}
              >
                {label}
              </span>
            </div>
          );

          return (
            <li key={label} className="flex items-center gap-2">
              {href ? (
                <Link
                  href={href}
                  className="rounded-lg transition-opacity hover:opacity-80"
                  aria-label={`Zurück zu Schritt ${stepNum}: ${label}`}
                >
                  {inner}
                </Link>
              ) : (
                <div aria-current={active ? "step" : undefined}>{inner}</div>
              )}
              {i < STEPS_LABELS.length - 1 ? (
                <span
                  className={cn(
                    "h-px w-5 md:w-8",
                    done ? "bg-accent/40" : "bg-brand-neutral/30"
                  )}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {children}
    </main>
  );
}
