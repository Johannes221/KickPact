import Link from "next/link";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { listMatchesForTeam } from "@/lib/db/queries/matches";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Mannschaft · KickPact" };

export default async function TeamDetailPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertClubAccess(slug, "viewer");

  const [team] = await db
    .select()
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

  const matches = await listMatchesForTeam(team.id, 30);

  return (
    <div className="space-y-5 md:space-y-8">
      <div>
        <Link href={`/verein/${slug}`} className="text-sm text-brand-night-navy/60 hover:text-accent">
          ← Vereins-Dashboard
        </Link>
        <h2 className="mt-1.5 md:mt-2 font-display font-black text-xl md:text-3xl tracking-tight text-brand-night-navy break-words">
          {team.name}
        </h2>
        <p className="text-sm text-brand-night-navy/60">Saison {team.saison}</p>
      </div>

      <section>
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy">
            Spiele
          </h3>
          <span className="text-xs text-brand-night-navy/50">
            {matches.length} Spiel{matches.length === 1 ? "" : "e"}
          </span>
        </div>
        {matches.length === 0 ? (
          <Card className="border-brand-neutral/40">
            <CardContent className="pt-6 text-sm text-brand-night-navy/60">
              Noch keine Spiele erfasst. Crawler-Cron läuft alle 6h und scrapt Fußball.de.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {matches.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/verein/${slug}/spiel/${m.id}`}
                  className="block rounded-lg border border-brand-neutral/40 bg-white p-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-brand-night-navy">
                        {m.heimName}{" "}
                        <span className="text-accent font-mono tabular-nums mx-1">
                          {m.ergebnisHeim ?? "—"}:{m.ergebnisGast ?? "—"}
                        </span>{" "}
                        {m.gastName}
                      </div>
                      <div className="text-xs text-brand-night-navy/50 mt-1">
                        {m.datum.toLocaleDateString("de-DE", {
                          weekday: "short",
                          day: "2-digit",
                          month: "long",
                          year: "numeric"
                        })}
                      </div>
                    </div>
                    <span className="text-accent text-xl">→</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
