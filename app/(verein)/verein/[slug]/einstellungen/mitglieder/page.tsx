import Link from "next/link";
import { eq } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubMemberships, teamMemberships, users, teams } from "@/lib/db/schema";
import {
  countClubAdmins,
  listPendingRequestsForClub
} from "@/lib/db/queries/membership-requests";
import { RequestsTable } from "./_components/requests-table";
import { MembersTable } from "./_components/members-table";

export const metadata = { title: "Mitglieder · KickPact" };

export default async function MitgliederPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, club } = await assertClubAccess(slug, "admin");

  const [pendingRequests, clubMems, teamMems, clubAdminCount] = await Promise.all([
    listPendingRequestsForClub(club.id),
    db
      .select({
        userId: clubMemberships.userId,
        email: users.email,
        role: clubMemberships.role,
        createdAt: clubMemberships.createdAt
      })
      .from(clubMemberships)
      .innerJoin(users, eq(clubMemberships.userId, users.id))
      .where(eq(clubMemberships.clubId, club.id)),
    db
      .select({
        userId: teamMemberships.userId,
        email: users.email,
        role: teamMemberships.role,
        teamName: teams.name,
        teamId: teams.id,
        createdAt: teamMemberships.createdAt
      })
      .from(teamMemberships)
      .innerJoin(teams, eq(teamMemberships.teamId, teams.id))
      .innerJoin(users, eq(teamMemberships.userId, users.id))
      .where(eq(teams.clubId, club.id)),
    countClubAdmins(club.id)
  ]);

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={`/verein/${slug}/einstellungen`}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← Einstellungen
        </Link>
        <h2 className="mt-1.5 font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Mitglieder
        </h2>
        <p className="text-sm text-brand-night-navy/60">
          Wer hat Zugriff auf {club.name} — und wer will Zugriff.
        </p>
      </div>

      {/* Offene Anfragen */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-3">
          Offene Anfragen
          {pendingRequests.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
              {pendingRequests.length}
            </span>
          )}
        </h3>
        <RequestsTable clubSlug={slug} requests={pendingRequests} />
      </section>

      {/* Aktive Mitglieder */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-3">
          Aktive Mitglieder
        </h3>

        <MembersTable
          clubSlug={slug}
          currentUserId={user.id}
          clubAdminCount={clubAdminCount}
          clubMembers={clubMems.map((m) => ({
            userId: m.userId,
            email: m.email,
            role: m.role
          }))}
          teamMembers={teamMems.map((m) => ({
            userId: m.userId,
            email: m.email,
            role: m.role,
            teamId: m.teamId,
            teamName: m.teamName
          }))}
        />
      </section>
    </div>
  );
}
