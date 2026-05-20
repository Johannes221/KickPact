import { redirect } from "next/navigation";
import Link from "next/link";
import { assertClubAccess } from "@/lib/auth/scope";
import { getMatchById, listMatchEvents } from "@/lib/db/queries/matches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MatchEventsList } from "./_components/match-events-list";
import { ManualEventEditor } from "./_components/manual-event-editor";

export const metadata = { title: "Spiel · KickPact" };

export default async function MatchDetailPage({
  params
}: {
  params: Promise<{ slug: string; matchId: string }>;
}) {
  const { slug, matchId } = await params;
  await assertClubAccess(slug, "viewer");

  const data = await getMatchById(matchId, slug);
  if (!data) {
    redirect(`/verein/${slug}`);
  }

  const events = await listMatchEvents(matchId);

  const { match, team } = data;
  const datumStr = match.datum.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/verein/${slug}/mannschaft/${team.id}`}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← {team.name}
        </Link>
      </div>

      {/* Score-Header */}
      <Card className="border-brand-neutral/40">
        <CardHeader>
          <CardTitle className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
            {datumStr} · Saison {team.saison}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 text-right">
              <div className="font-display font-black text-xl tracking-tight text-brand-night-navy">
                {match.heimName}
              </div>
              <div className="text-xs text-brand-night-navy/50 mt-1">Heim</div>
            </div>
            <div className="font-display font-black text-5xl md:text-6xl tracking-tight text-brand-night-navy tabular-nums">
              {match.ergebnisHeim ?? "—"}
              <span className="text-brand-night-navy/30 mx-2">:</span>
              {match.ergebnisGast ?? "—"}
            </div>
            <div className="flex-1">
              <div className="font-display font-black text-xl tracking-tight text-brand-night-navy">
                {match.gastName}
              </div>
              <div className="text-xs text-brand-night-navy/50 mt-1">Gast</div>
            </div>
          </div>
          {match.halbzeitHeim !== null && match.halbzeitGast !== null && (
            <div className="mt-4 text-center text-xs text-brand-night-navy/50 tabular-nums">
              Halbzeit {match.halbzeitHeim} : {match.halbzeitGast}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h2 className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
            Spielverlauf
          </h2>
          <span className="text-xs text-brand-night-navy/50">
            {events.length} Event{events.length === 1 ? "" : "s"}
          </span>
        </div>
        <MatchEventsList events={events} />
      </section>

      {/* Manual-Event-Editor */}
      <section className="flex justify-center pt-4">
        <ManualEventEditor matchId={match.id} />
      </section>
    </div>
  );
}
