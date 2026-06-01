import { ChevronDown } from "lucide-react";
import { TriggerIcon } from "@/components/shared/trigger-icon";
import { TRIGGER_META, type TriggerType } from "@/lib/triggers/labels";

const ALL_TYPES = Object.keys(TRIGGER_META) as TriggerType[];

const GROUPS: Array<{
  title: string;
  hint: string;
  match: (t: TriggerType) => boolean;
}> = [
  {
    title: "Pro Spiel · automatisch erkannt",
    hint: "KickPact liest diese Ereignisse nach jedem Spiel selbst von fußball.de.",
    match: (t) => TRIGGER_META[t].scope === "match" && TRIGGER_META[t].auto
  },
  {
    title: "Pro Spiel · manuell gemeldet",
    hint: "Trainer/Admin meldet diese Ereignisse nach dem Spiel selbst.",
    match: (t) => TRIGGER_META[t].scope === "match" && !TRIGGER_META[t].auto
  },
  {
    title: "Pro Saison",
    hint: "Einmal pro Saison — buchbar bis zum 5. Spieltag.",
    match: (t) => TRIGGER_META[t].scope === "season"
  }
];

/**
 * Transparenz-Sektion auf dem Pacts-Tab: zeigt — rein informativ — ALLE
 * Wetten-/Trigger-Typen, auf die Sponsoren bei dieser Mannschaft setzen können.
 * Read-only, kein State; einklappbar via <details>, damit es die aktiven Pacts
 * nicht überlagert.
 */
export function AvailableTriggers() {
  return (
    <details className="group rounded-2xl border border-brand-neutral/30 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Welche Wetten können Sponsoren wählen?
          </h3>
          <p className="mt-0.5 text-sm text-brand-night-navy/60">
            Alle Ereignisse, auf die Sponsoren bei euch setzen können — zur Transparenz.
          </p>
        </div>
        <ChevronDown
          className="h-5 w-5 shrink-0 text-brand-night-navy/40 transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>

      <div className="space-y-5 px-4 pb-4">
        {GROUPS.map((g) => {
          const items = ALL_TYPES.filter(g.match);
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              <div className="text-[0.7rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                {g.title}
              </div>
              <p className="mt-0.5 text-xs text-brand-night-navy/50">{g.hint}</p>
              <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {items.map((t) => (
                  <li
                    key={t}
                    className="flex items-center gap-2 rounded-lg border border-brand-neutral/30 bg-brand-off-white/50 px-3 py-2"
                  >
                    <TriggerIcon type={t} className="h-4 w-4 shrink-0 text-accent" />
                    <span className="truncate text-sm font-medium text-brand-night-navy">
                      {TRIGGER_META[t].label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </details>
  );
}
