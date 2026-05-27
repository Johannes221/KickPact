import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { clubMemberships, teamMemberships, users, teams } from "@/lib/db/schema";
import {
  countClubAdmins,
  listPendingRequestsForClub
} from "@/lib/db/queries/membership-requests";
import { RequestsTable } from "./_components/requests-table";
import { MembersTable } from "./_components/members-table";
import { InviteForm } from "./_components/invite-form";
import { PendingInvitationsTable } from "./_components/pending-invitations-table";
import { listPendingTeamMemberInvitationsForClub } from "@/lib/db/queries/invitations";

export const metadata = { title: "Mitglieder · KickPact" };

export default async function MitgliederPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { user, club } = await assertClubAccess(slug, "admin");

  const [pendingRequests, pendingInvitations, clubMems, teamMems, clubAdminCount, clubTeams] = await Promise.all([
    listPendingRequestsForClub(club.id),
    listPendingTeamMemberInvitationsForClub(club.id),
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
    countClubAdmins(club.id),
    db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(and(eq(teams.clubId, club.id), eq(teams.isActive, true)))
      .orderBy(asc(teams.name))
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

      {/* Trainer/Viewer einladen */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-1">
          Trainer oder Viewer einladen
        </h3>
        <p className="text-sm text-brand-night-navy/60 mb-3">
          Erzeugt einen Einladungs-Link. Schick ihn an die Person — sie loggt sich ein
          und ist mit einem Klick drin.
        </p>
        <InviteForm clubSlug={slug} teams={clubTeams} />
      </section>

      {/* Offene Einladungen */}
      <section>
        <h3 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-1">
          Offene Einladungen
          {pendingInvitations.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
              {pendingInvitations.length}
            </span>
          )}
        </h3>
        <p className="text-sm text-brand-night-navy/60 mb-3">
          Links, die noch nicht angenommen wurden. Kopieren, erneuern (neuer 30-Tage-Link)
          oder widerrufen.
        </p>
        <PendingInvitationsTable
          clubSlug={slug}
          rows={pendingInvitations.map((inv) => ({
            id: inv.id,
            token: inv.token,
            recipientEmail: inv.recipientEmail,
            role: inv.role,
            teamId: inv.teamId,
            teamName: inv.teamName,
            createdAt: inv.createdAt,
            expiresAt: inv.expiresAt
          }))}
          baseUrl={process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}
        />
      </section>

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
