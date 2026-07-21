import { CalendarClock } from "lucide-react";
import { StoryShareButton } from "@/components/shared/story-share-button";
import { TeamCrest } from "@/components/shared/team-crest";
import { crestSrc } from "@/lib/utils/crest-url";
import { kickoffLabel } from "@/lib/story/story-content";
import { formatDate } from "@/lib/utils/date-format";
import type { StoryMatch } from "@/lib/db/queries/story";

/**
 * „Bevorstehendes Spiel"-Karte auf der Mannschafts-Übersicht (Aufgabe #44).
 *
 * Zeigt automatisch das NÄCHSTE Spiel und bietet direkt die Story-Vorschau zum
 * Posten an. Server-Component; nur der Teilen-Dialog ist Client.
 *
 * Bewusst OHNE Anstoßzeit — `matches.datum` ist ein Datums-Platzhalter mit
 * fester Mittagszeit (siehe lib/story/story-data.ts). Lieber Wochentag +
 * Datum ehrlich zeigen als eine erfundene Uhrzeit.
 */
export function UpcomingMatchCard({
  match,
  teamId,
  now = new Date()
}: {
  match: StoryMatch;
  teamId: string;
  now?: Date;
}) {
  const heimspiel = match.ownSide === "heim";
  const gegner = heimspiel ? match.gastName : match.heimName;
  const gegnerTeamId = heimspiel ? match.gastTeamId : match.heimTeamId;

  return (
    <section
      aria-label="Bevorstehendes Spiel"
      className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5"
    >
      <div className="flex items-center gap-2 text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
        Bevorstehendes Spiel
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display font-bold text-xl tracking-tight text-brand-night-navy">
          {kickoffLabel(match.datum, now)}
        </span>
        <span className="text-sm text-brand-night-navy/60">
          {formatDate(match.datum, {
            weekday: "short",
            day: "2-digit",
            month: "2-digit"
          })}
          {" · "}
          {heimspiel ? "Heimspiel" : "Auswärtsspiel"}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <TeamCrest name={gegner} src={crestSrc(gegner, gegnerTeamId)} size={28} />
        <span className="text-base font-semibold text-brand-night-navy">
          {heimspiel ? "gegen " : "bei "}
          {gegner}
        </span>
      </div>

      <div className="mt-4">
        <StoryShareButton
          teamId={teamId}
          matchId={match.id}
          label="Vorschau posten"
          variant="accent"
          className="w-full sm:w-auto"
        />
      </div>
    </section>
  );
}
