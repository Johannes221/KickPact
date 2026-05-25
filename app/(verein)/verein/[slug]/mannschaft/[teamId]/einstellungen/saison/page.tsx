import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, seasonResults } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
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
  const { club } = await assertClubAccess(slug, "admin");

  const [team] = await db
    .select({ id: teams.id, name: teams.name, saison: teams.saison })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  const [seasonResult] = await db
    .select()
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, team.id), eq(seasonResults.saison, team.saison)))
    .limit(1);

  const base = `/verein/${slug}/mannschaft/${teamId}`;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link
          href={`${base}/einstellungen`}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← Einstellungen
        </Link>
        <h2 className="mt-1.5 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Saison-Ergebnis manuell setzen
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          {team.name} · Saison {team.saison}
        </p>
      </div>

      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 md:p-5 text-sm text-brand-night-navy/80 leading-relaxed">
        Normalerweise übernimmt der Fußball.de-Crawler den Saison-Endstand automatisch
        nach Saisonende. Trage hier nur dann manuell ein, wenn der Crawler keine Daten
        liefert (z.B. abgebrochene Saison, kreisfreie Custom-Wertungen oder
        Pokal-Sondersituationen).
      </div>

      <SeasonResultForm
        teamId={team.id}
        saison={team.saison}
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
