import Link from "next/link";
import { CalendarClock, Trophy } from "lucide-react";
import { TeamCrest } from "@/components/shared/team-crest";
import { crestSrc } from "@/lib/utils/crest-url";
import type {
  SponsoredTeamMatches,
  SponsoredTeamMatch
} from "@/lib/db/queries/sponsor-dashboard";

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short"
  });
}

/** Liefert "2:1" o.ä. oder null, wenn (noch) kein Ergebnis vorliegt. */
function score(m: SponsoredTeamMatch): string | null {
  if (m.ergebnisHeim == null || m.ergebnisGast == null) return null;
  return `${m.ergebnisHeim}:${m.ergebnisGast}`;
}

/**
 * Dashboard-Sektion: letztes + nächstes Spiel pro gesponserter Mannschaft.
 * Reine Anzeige (Server Component) — Daten kommen aus getSponsoredTeamMatches.
 */
export function SponsoredMatches({ teams }: { teams: SponsoredTeamMatches[] }) {
  if (teams.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg md:text-xl font-bold text-brand-night-navy">
          Spiele deiner Mannschaften
        </h2>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((t) => (
          <div
            key={t.teamId}
            className="rounded-2xl bg-white shadow-ios-card p-4 space-y-3"
          >
            <div className="min-w-0">
              <div className="font-semibold text-sm text-brand-night-navy truncate">
                {t.teamName}
              </div>
              <div className="text-xs text-brand-night-navy/50 truncate">
                {t.clubName}
              </div>
            </div>

            <div className="space-y-2">
              <MatchRow
                label="Zuletzt"
                icon={<Trophy className="h-3.5 w-3.5" aria-hidden />}
                match={t.lastMatch}
                emptyText="Noch kein Spiel gespielt"
              />
              <MatchRow
                label="Nächstes"
                icon={<CalendarClock className="h-3.5 w-3.5" aria-hidden />}
                match={t.nextMatch}
                emptyText="Kein Spiel angesetzt"
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MatchRow({
  label,
  icon,
  match,
  emptyText
}: {
  label: string;
  icon: React.ReactNode;
  match: SponsoredTeamMatch | null;
  emptyText: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-brand-off-white px-3 py-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-brand-night-navy/60">
        {icon}
      </span>
      <span className="text-[0.65rem] uppercase tracking-wide font-semibold text-brand-night-navy/60 w-14 shrink-0">
        {label}
      </span>
      {match ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-brand-night-navy/80">
            <TeamCrest name={match.heimName} src={crestSrc(match.heimName, match.heimTeamId)} size={16} />
            <span className="min-w-0 truncate">
              {match.heimName} – {match.gastName}
            </span>
            <TeamCrest name={match.gastName} src={crestSrc(match.gastName, match.gastTeamId)} size={16} />
          </span>
          <span className="shrink-0 text-xs font-semibold text-brand-night-navy">
            {score(match) ?? formatDate(match.datum)}
          </span>
        </div>
      ) : (
        <span className="flex-1 text-xs text-brand-night-navy/60">{emptyText}</span>
      )}
    </div>
  );
}
