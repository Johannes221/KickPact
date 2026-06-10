import Link from "next/link";
import { eq, sql, desc } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { listInquiriesForSponsor } from "@/lib/db/queries/sponsor-discover";
import { db } from "@/lib/db/client";
import { pledges, teams, clubs } from "@/lib/db/schema";
import { PageHeader } from "@/components/shared/page-header";
import { ChevronRight, Users, ArrowRight } from "lucide-react";

export const metadata = { title: "Mannschaften · KickPact" };

export default async function SponsorMannschaftenPage() {
  const user = await requireUser();
  const sponsor = await findSponsorForUser(user.id);

  const rows = sponsor
    ? await db
        .select({
          teamId: teams.id,
          teamName: teams.name,
          clubName: clubs.name,
          league: teams.league,
          publicSlug: teams.publicSlug,
          activePledges: sql<number>`count(*) FILTER (WHERE ${pledges.status} = 'active')::int`,
          totalPledges: sql<number>`count(*)::int`
        })
        .from(pledges)
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .innerJoin(clubs, eq(teams.clubId, clubs.id))
        .where(eq(pledges.sponsorId, sponsor.id))
        .groupBy(teams.id, teams.name, clubs.name, teams.league, teams.publicSlug)
        .orderBy(desc(sql`count(*) FILTER (WHERE ${pledges.status} = 'active')`))
    : [];

  // Angenommene Anfragen, bei denen nur noch der Pact einzurichten ist: Verein
  // hat zugesagt (gültiger Token), aber noch kein aktiver Pledge. Teams, die
  // bereits oben (mit Pledge) gelistet sind, hier ausblenden — keine Dubletten.
  const inquiries = sponsor ? await listInquiriesForSponsor(user.id) : [];
  const pledgeTeamIds = new Set(rows.map((r) => r.teamId));
  const acceptedAwaiting = inquiries.filter(
    (i) =>
      i.status === "accepted" &&
      i.inviteToken &&
      !i.hasActivePledge &&
      !pledgeTeamIds.has(i.teamId)
  );

  const isEmpty = rows.length === 0 && acceptedAwaiting.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mannschaften"
        subtitle="Alle Teams, die du unterstützt."
      />

      {isEmpty ? (
        <div className="rounded-2xl bg-white p-8 text-center shadow-ios-card">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent-dark">
            <Users className="h-6 w-6" aria-hidden />
          </span>
          <p className="font-semibold text-brand-night-navy">Noch keine Mannschaften</p>
          <p className="mt-1 text-sm text-brand-night-navy/60">
            Finde eine Mannschaft über{" "}
            <Link href="/sponsor/discover" className="font-semibold text-accent-dark">
              Entdecken
            </Link>{" "}
            und richte deinen ersten Pact ein.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Angenommen — Pact noch einzurichten */}
          {acceptedAwaiting.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-night-navy/50">
                Angenommen — richte deinen Pact ein
              </h2>
              <ul className="space-y-2.5">
                {acceptedAwaiting.map((t) => (
                  <li key={t.id}>
                    <div className="rounded-2xl bg-white p-4 shadow-ios-card">
                      <p className="truncate font-display font-black tracking-tight text-brand-night-navy">
                        {t.teamName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-brand-night-navy/55">
                        {t.clubName}
                      </p>
                      <Link
                        href={`/sponsor/pledge/new?invitation=${t.inviteToken}`}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-opacity active:opacity-80"
                      >
                        Pact einrichten
                        <ArrowRight className="h-4 w-4" aria-hidden />
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Teams mit (mind. einem) Pact */}
          {rows.length > 0 && (
            <section className="space-y-2.5">
              {acceptedAwaiting.length > 0 && (
                <h2 className="text-[0.65rem] font-semibold uppercase tracking-widest text-brand-night-navy/50">
                  Mit aktivem Pact
                </h2>
              )}
              <ul className="space-y-2.5">
                {rows.map((t) => {
                  const href = t.publicSlug ? `/m/${t.publicSlug}` : "/sponsor/pledge";
                  return (
                    <li key={t.teamId}>
                      <Link
                        href={href}
                        className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-ios-card transition-opacity active:opacity-70"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display font-black tracking-tight text-brand-night-navy">
                            {t.teamName}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-brand-night-navy/55">
                            {t.clubName}
                            {t.league ? ` · ${t.league}` : ""}
                          </p>
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-dark">
                            {t.activePledges > 0
                              ? `${t.activePledges} aktive${t.activePledges === 1 ? "r" : ""} Pact${t.activePledges === 1 ? "" : "s"}`
                              : `${t.totalPledges} Pact${t.totalPledges === 1 ? "" : "s"}`}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 shrink-0 text-brand-night-navy/30" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
