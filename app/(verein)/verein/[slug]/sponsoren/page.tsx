import { and, eq, inArray, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  clubs,
  sponsorInvitations,
  sponsors,
  pledges,
  users,
  sponsorInquiries
} from "@/lib/db/schema";
import { assertVereinAdminOrRedirect } from "@/lib/auth/scope";
import { SponsorsManager } from "./_components/sponsors-manager";
import { InquiriesInbox } from "./_components/inquiries-inbox";
import { DiscoverabilityPanel } from "./_components/discoverability-panel";

export const metadata = { title: "Sponsoren · KickPact" };

export default async function SponsorenPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertVereinAdminOrRedirect(slug, "viewer");

  // Teams of this club — inkl. Container-Verifizierung (Sponsoren-Gate, Design
  // 2026-05-29 §3.5/§6). Das Gate prüft den Container-Verein DER MANNSCHAFT
  // (teams.clubId → clubs.verifiedAt), der vom Slug-Verein abweichen kann.
  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      discoverable: teams.discoverable,
      publicTagline: teams.publicTagline,
      containerVerifiedAt: clubs.verifiedAt
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.clubId, club.id));
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
        .orderBy(sponsorInvitations.createdAt)
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

  // Pending Discover-Anfragen für die Teams dieses Vereins
  const inquiries =
    teamIds.length > 0
      ? await db
          .select({
            id: sponsorInquiries.id,
            teamId: sponsorInquiries.teamId,
            teamName: teams.name,
            status: sponsorInquiries.status,
            message: sponsorInquiries.message,
            createdAt: sponsorInquiries.createdAt,
            sponsorEmail: users.email,
            sponsorName: users.name
          })
          .from(sponsorInquiries)
          .innerJoin(teams, eq(sponsorInquiries.teamId, teams.id))
          .innerJoin(users, eq(sponsorInquiries.sponsorUserId, users.id))
          .where(
            and(
              inArray(sponsorInquiries.teamId, teamIds),
              eq(sponsorInquiries.status, "pending")
            )
          )
          .orderBy(desc(sponsorInquiries.createdAt))
      : [];

  return (
    <div className="space-y-6 md:space-y-10">
      <SponsorsManager
        clubSlug={slug}
        teams={teamRows.map((t) => ({
          id: t.id,
          name: t.name,
          canInvite: t.containerVerifiedAt !== null
        }))}
        invitations={invitations.map((i) => ({
          id: i.inv.id,
          token: i.inv.token,
          status: i.inv.status,
          createdAt: i.inv.createdAt,
          teamId: i.team.id,
          teamName: i.team.name,
          recipientName: i.inv.recipientName ?? null
        }))}
      />

      {/* Sponsor-Inquiries (Discover) — Inbox-Sektion */}
      {inquiries.length > 0 && (
        <InquiriesInbox
          inquiries={inquiries.map((i) => ({
            ...i,
            createdAt: i.createdAt,
            sponsorName: i.sponsorName ?? null
          }))}
        />
      )}

      {/* Discoverability-Toggle pro Team */}
      <DiscoverabilityPanel
        teams={teamRows.map((t) => ({
          id: t.id,
          name: t.name,
          discoverable: t.discoverable,
          publicTagline: t.publicTagline ?? ""
        }))}
      />

      <section>
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Aktive Sponsoren ({activeSponsors.length})
        </h2>
        {activeSponsors.length === 0 ? (
          <p className="mt-3 text-sm text-brand-night-navy/60">
            Noch keine. Über Einladungslinks oben werben oder Discover aktivieren.
          </p>
        ) : (
          <ul className="mt-3 md:mt-4 space-y-2">
            {activeSponsors.map((s, i) => (
              <li
                key={`${s.sponsorId}-${i}`}
                className="rounded-lg border border-brand-neutral/40 bg-white p-3 md:p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-sm md:text-base text-brand-night-navy truncate">
                    {s.displayName}
                  </div>
                  <div className="text-xs text-brand-night-navy/50 mt-0.5 truncate">
                    {s.userEmail} · <span className="capitalize">{s.type}</span> · {s.teamName}
                  </div>
                </div>
                <div className="text-[0.65rem] md:text-xs uppercase tracking-widest font-semibold text-accent-dark shrink-0">
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
