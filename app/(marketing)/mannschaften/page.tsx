import {
  listDiscoverableTeams,
  listDiscoveryFacets
} from "@/lib/db/queries/sponsor-discover";
import { DiscoverFilters } from "@/app/(sponsor)/sponsor/discover/_components/discover-filters";
import { TeamDiscoverCard } from "@/app/(sponsor)/sponsor/discover/_components/team-discover-card";

export const metadata = {
  title: "Mannschaften entdecken · KickPact",
  description:
    "Finde Amateur-Mannschaften zum Sponsern — nach Liga und Ort filtern und direkt anfragen."
};

export default async function MannschaftenPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string; league?: string; ort?: string }>;
}) {
  const sp = await searchParams;
  const current = { q: sp.q ?? "", league: sp.league ?? "", ort: sp.ort ?? "" };
  const [teamsList, facets] = await Promise.all([
    listDiscoverableTeams({
      search: current.q,
      league: current.league,
      ort: current.ort,
      limit: 60
    }),
    listDiscoveryFacets()
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <h1 className="font-display font-black text-3xl md:text-5xl tracking-tight text-brand-night-navy">
        Mannschaften entdecken
      </h1>
      <p className="mt-2 text-brand-night-navy/60">
        Finde Mannschaften zum Sponsern — filtere nach Liga und Ort und frag direkt an.
      </p>
      <div className="mt-6">
        <DiscoverFilters basePath="/mannschaften" facets={facets} current={current} />
      </div>
      {teamsList.length === 0 ? (
        <p className="mt-10 text-center text-brand-night-navy/60">
          Keine Mannschaften gefunden. Passe Suche oder Filter an.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teamsList.map((t) => (
            <TeamDiscoverCard key={t.teamId} team={t} mode="public" />
          ))}
        </div>
      )}
    </div>
  );
}
