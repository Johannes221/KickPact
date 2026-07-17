import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getWrappedStats, WRAPPED_MIN_MATCHES } from "@/lib/db/queries/wrapped";
import { getCachedStandingsForRequest } from "@/lib/recap/standings-request";
import { getFullTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { prevSaisonCode, saisonLabel } from "@/lib/utils/saison";
import { WrappedPlayer } from "./_components/wrapped-player";

export const metadata = { title: "Saison-Wrapped · KickPact" };

/**
 * Saison-Wrapped (W4, Plan 2026-06-12): durchswipebare Story über die
 * VORSAISON der Mannschaft. Unter WRAPPED_MIN_MATCHES gespielten
 * Vorsaison-Spielen gibt es statt des Players eine freundliche
 * „Noch kein Rückblick"-Karte.
 */
export default async function WrappedPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "viewer");

  const teamBase = `/verein/${slug}/mannschaft/${teamId}`;
  const team = await getFullTeamInClub(teamId, club.id);
  const prevSaison = team ? prevSaisonCode(team.saison) : null;
  // Liga-Tabelle (verifizierte Voll-Saison-Aggregate) best-effort + gecacht;
  // null → Wrapped fällt ehrlich auf die ausgewerteten Spiele zurück.
  const standings =
    team && prevSaison ? await getCachedStandingsForRequest(teamId, prevSaison) : null;
  const stats =
    team && prevSaison
      ? await getWrappedStats(teamId, prevSaison, standings)
      : null;

  if (!team || !prevSaison || !stats || stats.spiele < WRAPPED_MIN_MATCHES) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-white p-6 text-center shadow-ios-card">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent-dark">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-4 font-display text-xl font-bold tracking-tight text-brand-night-navy">
            Noch kein Rückblick
          </h1>
          <p className="mt-2 text-sm text-brand-night-navy/70">
            Für euer Saison-Wrapped brauchen wir mindestens {WRAPPED_MIN_MATCHES}{" "}
            gespielte Spiele aus der letzten Saison. Sobald genug Spieldaten da
            sind, gibt&apos;s hier eure Highlight-Story.
          </p>
          <Button asChild variant="accent" className="mt-5">
            <Link href={teamBase}>Zurück zum Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <WrappedPlayer
      stats={stats}
      saisonLabel={saisonLabel(prevSaison)}
      nextSaisonLabel={saisonLabel(team.saison)}
      dashboardHref={teamBase}
      sponsorenHref={`${teamBase}/sponsoren`}
      imageBase={`/api/teams/${teamId}/wrapped-image`}
    />
  );
}
