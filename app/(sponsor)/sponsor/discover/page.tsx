import { Suspense } from "react";
import { requireUser } from "@/lib/auth/session";
import { listDiscoverableTeams, listInquiriesForSponsor } from "@/lib/db/queries/sponsor-discover";
import { DiscoverList } from "./_components/discover-list";
import { InquiriesList } from "./_components/inquiries-list";

export const metadata = { title: "Mannschaften entdecken · KickPact" };

interface SearchParams {
  q?: string;
}

export default async function DiscoverPage({
  searchParams
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const search = params.q ?? "";

  const [teamsList, myInquiries] = await Promise.all([
    listDiscoverableTeams({ search, sponsorUserId: user.id, limit: 50 }),
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

      {/* Such-Form */}
      <form className="mb-6 md:mb-8" action="/sponsor/discover" method="GET">
        <label className="block">
          <span className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Suche
          </span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="z.B. SG Reichenbach, München, U17 …"
            className="mt-1.5 w-full rounded-lg border border-brand-neutral/40 bg-white px-4 py-3 text-base text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
      </form>

      <Suspense fallback={<div className="text-brand-night-navy/60">Lade…</div>}>
        <DiscoverList teams={teamsList} />
      </Suspense>

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
