import Link from "next/link";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import {
  getTeamInClub,
  resolveSeasonResultTarget
} from "@/lib/db/queries/team-lifecycle";
import { saisonLabel } from "@/lib/utils/saison";
import { SeasonResultForm } from "../../_components/season-result-form";

export const metadata = { title: "Saison-Ergebnis · Einstellungen · KickPact" };

/**
 * Manuelles Saison-Ergebnis: Fallback-Formular für Mannschafts-Admins, wenn der
 * Fußball.de-Crawler keine End-Stand-Daten liefert (abgebrochene Saison, kreisfreie
 * Wertung, Pokal-Sondersituationen). Im Normalfall wird der Endstand nach
 * Saisonende automatisch übernommen.
 */
export default async function TeamEinstellungenSaisonPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "admin");

  const team = await getTeamInClub(teamId, club.id);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  // Review K2: Nach dem Saison-Bump (15.7.) gehört das abzuschließende
  // Ergebnis zur Vorsaison — der Resolver entscheidet, welche Saison das
  // Formular bedient (sonst landet der Juli-Eintrag auf der neuen Saison
  // und die alten Saison-Pacts werden nie ausgewertet).
  const target = await resolveSeasonResultTarget(team.id, team.saison);
  const seasonResult = target.result;

  const base = `/verein/${slug}/mannschaft/${teamId}`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`${base}/einstellungen`}
          className="hidden md:inline-block text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← Einstellungen
        </Link>
        <h2 className="mt-1.5 font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Saison-Ergebnis manuell setzen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          {team.name} · Saison {saisonLabel(target.saison)}
        </p>
      </div>

      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 md:p-5 text-sm text-brand-night-navy/80 leading-relaxed">
        Normalerweise wird der Saison-Endstand nach Saisonende automatisch
        übernommen. Trage hier nur dann manuell ein, wenn keine automatischen Daten
        vorliegen (z.B. abgebrochene Saison, kreisfreie Custom-Wertungen oder
        Pokal-Sondersituationen).
      </div>

      <SeasonResultForm
        teamId={team.id}
        saison={target.saison}
        current={
          seasonResult
            ? {
                finalPosition: seasonResult.finalPosition,
                teamsInLeague: seasonResult.teamsInLeague,
                promoted: seasonResult.promoted,
                relegated: seasonResult.relegated,
                cupRoundReached: seasonResult.cupRoundReached,
                customNotes: seasonResult.customNotes
              }
            : null
        }
      />
    </div>
  );
}
