import Link from "next/link";
import { redirect } from "next/navigation";
import { assertTeamPageAccess, canManageTeamMembers } from "@/lib/auth/scope";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import {
  listPendingRequestsForTeam,
  countTeamAdmins,
  listTeamMembers
} from "@/lib/db/queries/membership-requests";
import { listPendingTeamMemberInvitationsForTeam } from "@/lib/db/queries/invitations";
import { MembersTable } from "@/app/(verein)/verein/[slug]/einstellungen/mitglieder/_components/members-table";
import { InviteForm } from "@/app/(verein)/verein/[slug]/einstellungen/mitglieder/_components/invite-form";
import { RequestsTable } from "@/app/(verein)/verein/[slug]/einstellungen/mitglieder/_components/requests-table";
import { PendingInvitationsTable } from "@/app/(verein)/verein/[slug]/einstellungen/mitglieder/_components/pending-invitations-table";
import {
  inviteTeamMemberAction,
  revokeTeamMemberInvitationAction,
  refreshTeamMemberInvitationAction
} from "./_actions/invite";
import { changeRoleAction, revokeAction } from "./_actions/manage";
import { approveRequestAction, rejectRequestAction } from "./_actions/approve-reject";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Mitglieder · Mannschaft · KickPact" };

export default async function TeamMitgliederPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { user, club } = await assertTeamPageAccess(slug, teamId, "viewer");

  // Nur Mannschaftsadmins (oder Verein-Admins vereinsgeführter Teams) dürfen
  // hier verwalten. Viewer landen zurück auf den Einstellungen.
  if (!(await canManageTeamMembers(user.id, teamId))) {
    redirect(`/verein/${slug}/mannschaft/${teamId}/einstellungen`);
  }

  const team = await getTeamInClub(teamId, club.id);
  if (!team) redirect(`/verein/${slug}/mannschaft/${teamId}/einstellungen`);

  const [members, pendingInvitations, pendingRequests, teamAdminCount] =
    await Promise.all([
      listTeamMembers(teamId),
      listPendingTeamMemberInvitationsForTeam(teamId),
      listPendingRequestsForTeam(teamId),
      countTeamAdmins(teamId)
    ]);

  const base = `/verein/${slug}/mannschaft/${teamId}/einstellungen`;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href={base}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← Einstellungen
        </Link>
        <h2 className="mt-1.5 font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Mitglieder &amp; Zugriff
        </h2>
        <p className="text-sm text-brand-night-navy/60">
          Wer hat Zugriff auf {team.name} — und wer will Zugriff.
        </p>
      </div>

      {/* Einladen */}
      <section>
        <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy mb-1">
          Mannschaftsadmin oder Viewer einladen
        </h3>
        <p className="text-sm text-brand-night-navy/60 mb-3">
          Erzeugt einen Einladungs-Link. Schick ihn an die Person — sie loggt
          sich ein und ist mit einem Klick drin.
        </p>
        <InviteForm
          clubSlug={slug}
          inviteAction={inviteTeamMemberAction}
          fixedTeamId={teamId}
          roleOptions={[
            { value: "admin", label: "Mannschaftsadmin — darf alles" },
            { value: "viewer", label: "Viewer — sieht alles, ändert nichts" }
          ]}
          defaultRole="admin"
        />
      </section>

      {/* Offene Einladungen */}
      <section>
        <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy mb-1">
          Offene Einladungen
          {pendingInvitations.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent">
              {pendingInvitations.length}
            </span>
          )}
        </h3>
        <p className="text-sm text-brand-night-navy/60 mb-3">
          Links, die noch nicht angenommen wurden. Kopieren, erneuern oder
          widerrufen.
        </p>
        <PendingInvitationsTable
          clubSlug={slug}
          showTeamColumn={false}
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
          revokeAction={revokeTeamMemberInvitationAction}
          refreshAction={refreshTeamMemberInvitationAction}
        />
      </section>

      {/* Offene Anfragen */}
      <section>
        <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy mb-3">
          Offene Anfragen
          {pendingRequests.length > 0 && (
            <Badge tone="warning" className="ml-2">{pendingRequests.length}</Badge>
          )}
        </h3>
        <RequestsTable
          clubSlug={slug}
          requests={pendingRequests}
          approveAction={approveRequestAction}
          rejectAction={rejectRequestAction}
        />
      </section>

      {/* Aktive Mitglieder */}
      <section>
        <h3 className="font-display font-bold text-xl tracking-tight text-brand-night-navy mb-3">
          Aktive Mitglieder
        </h3>
        <MembersTable
          clubSlug={slug}
          currentUserId={user.id}
          clubMembers={[]}
          teamAdminCount={teamAdminCount}
          changeRoleAction={changeRoleAction}
          revokeAction={revokeAction}
          teamMembers={members.map((m) => ({
            userId: m.userId,
            email: m.email,
            role: m.role,
            teamId: team.id,
            teamName: team.name
          }))}
        />
      </section>
    </div>
  );
}
