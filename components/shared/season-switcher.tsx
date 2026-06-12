import Link from "next/link";
import { cn } from "@/lib/utils";
import { saisonLabel } from "@/lib/utils/saison";

/**
 * Saison-Switcher (W1.3): Pill-Reihe „26/27 · 25/26" zum Umschalten der
 * ANZEIGE-Saison einer Spiele-Liste. Server-Component-freundlich — reine
 * Links mit `?saison=`-URL-Param, kein Client-JS.
 *
 * Rendert nichts, wenn es nur eine Saison gibt (kein toter Single-Pill-UI).
 * Charges/Stats hängen NICHT an dieser Auswahl — sie steuert nur Listen.
 */
export function SeasonSwitcher({
  seasons,
  current,
  hrefFor,
  className
}: {
  /** Verfügbare Saison-Codes ("2627"), absteigend — aus listAvailableSeasonsForTeam. */
  seasons: string[];
  /** Aktuell angezeigte Saison ("2627"). */
  current: string;
  /** Baut den Link je Saison (Caller erhält restliche URL-Params/Anchor). */
  hrefFor: (saison: string) => string;
  className?: string;
}) {
  if (seasons.length < 2) return null;
  return (
    <nav
      aria-label="Saison wählen"
      className={cn(
        "-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 no-scrollbar",
        className
      )}
    >
      {seasons.map((s) => {
        const active = s === current;
        return (
          <Link
            key={s}
            href={hrefFor(s)}
            aria-current={active ? "true" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors",
              active
                ? "bg-accent text-white shadow-ios-card"
                : "bg-white shadow-ios-card text-brand-night-navy/60 hover:text-brand-night-navy"
            )}
          >
            {saisonLabel(s)}
          </Link>
        );
      })}
    </nav>
  );
}
