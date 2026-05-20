import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, sponsorInvitations, sponsors, pledges, users } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { SponsorsManager } from "./_components/sponsors-manager";

export const metadata = { title: "Sponsoren · KickPact" };

export default async function SponsorenPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "viewer");

  // Teams of this club
  const teamRows = await db.select().from(teams).where(eq(teams.clubId, club.id));
  const teamIds = teamRows.map((t) => t.id);

  // Active invitations for these teams
  const invitations = teamIds.length
    ? await db
        .select({
          inv: sponsorInvitations,
          team: teams
        })
        .from(sponsorInvitations)
        .innerJoin(teams, eq(sponsorInvitations.teamId, teams.id))
        .where(eq(teams.clubId, club.id))
    : [];

  // Active sponsors (über pledges -> teamId IN clubTeams)
  const activeSponsors = teamIds.length
    ? await db
        .select({
          sponsorId: sponsors.id,
          displayName: sponsors.displayName,
          type: sponsors.type,
          userEmail: users.email,
          teamId: pledges.teamId,
          teamName: teams.name,
          pledgeStatus: pledges.status
        })
        .from(pledges)
        .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
        .innerJoin(users, eq(sponsors.userId, users.id))
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .where(eq(teams.clubId, club.id))
    : [];

  return (
    <div className="space-y-10">
      <SponsorsManager
        clubSlug={slug}
        teams={teamRows.map((t) => ({ id: t.id, name: t.name }))}
        invitations={invitations.map((i) => ({
          id: i.inv.id,
          token: i.inv.token,
          status: i.inv.status,
          createdAt: i.inv.createdAt,
          teamId: i.team.id,
          teamName: i.team.name
        }))}
      />

      <section>
        <h2 className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
          Aktive Sponsoren ({activeSponsors.length})
        </h2>
        {activeSponsors.length === 0 ? (
          <p className="mt-3 text-sm text-brand-night-navy/60">
            Noch keine. Über Einladungslinks oben werben.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {activeSponsors.map((s, i) => (
              <li
                key={`${s.sponsorId}-${i}`}
                className="rounded-lg border border-brand-neutral/40 bg-white p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-brand-night-navy">{s.displayName}</div>
                  <div className="text-xs text-brand-night-navy/50 mt-0.5">
                    {s.userEmail} · <span className="capitalize">{s.type}</span> · {s.teamName}
                  </div>
                </div>
                <div className="text-xs uppercase tracking-widest font-semibold text-accent-dark">
                  {s.pledgeStatus}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
