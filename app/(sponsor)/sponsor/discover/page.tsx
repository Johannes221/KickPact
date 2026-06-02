import { requireUser } from "@/lib/auth/session";
import {
  listDiscoverableTeams,
  listDiscoveryFacets,
  listInquiriesForSponsor
} from "@/lib/db/queries/sponsor-discover";
import { DiscoverFilters } from "./_components/discover-filters";
import { TeamDiscoverCard } from "./_components/team-discover-card";
import { InquiriesList } from "./_components/inquiries-list";

export const metadata = { title: "Mannschaften entdecken · KickPact" };

interface SearchParams {
  q?: string;
  league?: string;
  ort?: string;
}

export default async function DiscoverPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const current = { q: sp.q ?? "", league: sp.league ?? "", ort: sp.ort ?? "" };

  const [teamsList, facets, myInquiries] = await Promise.all([
    listDiscoverableTeams({
      search: current.q,
      league: current.league,
      ort: current.ort,
      sponsorUserId: user.id,
      limit: 60
    }),
    listDiscoveryFacets(),
    listInquiriesForSponsor(user.id)
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Mannschaften entdecken
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
          Such nach Mannschaft, Verein oder Ort — und frag direkt an, ob du sie sponsoren darfst.
        </p>
      </div>

      <DiscoverFilters basePath="/sponsor/discover" facets={facets} current={current} />

      {teamsList.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8 text-center">
          <p className="font-display font-black text-base md:text-lg text-brand-night-navy">
            Keine Mannschaften gefunden
          </p>
          <p className="mt-1.5 text-sm text-brand-night-navy/60">
            Versuch eine andere Suche oder passe die Filter an.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teamsList.map((t) => (
            <TeamDiscoverCard key={t.teamId} team={t} mode="sponsor" />
          ))}
        </div>
      )}

      {myInquiries.length > 0 && (
        <section className="mt-8 md:mt-12">
          <h2 className="font-display font-black text-lg md:text-2xl tracking-tight text-brand-night-navy mb-3 md:mb-4">
            Deine Anfragen
          </h2>
          <InquiriesList inquiries={myInquiries} />
        </section>
      )}
    </div>
  );
}
