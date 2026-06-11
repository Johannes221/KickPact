import Link from "next/link";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { getClubById } from "@/lib/db/queries/club-admin";
import {
  getTeamLicensePlanDirect
} from "@/lib/db/queries/subscriptions";
import { listPendingInquiriesForTeam } from "@/lib/db/queries/sponsoring-admin";
import { listInvitationsForTeam } from "@/lib/db/queries/invitations";
import { listSponsorsForTeam } from "@/lib/db/queries/team-dashboard";
import { SponsorInviteCard } from "./_components/sponsor-invite-card";
import { InquiriesInbox } from "../../../sponsoren/_components/inquiries-inbox";
import { eur } from "@/lib/utils/currency";

export const metadata = { title: "Sponsoren · KickPact" };

export default async function TeamSponsorenPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club, role } = await assertTeamPageAccess(slug, teamId, "viewer");

  const team = await getTeamInClub(teamId, club.id);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  // Offene Sponsor-Anfragen (Discover) FÜR DIESE MANNSCHAFT. Bewusst auf
  // Team-Ebene: ein Team-Admin (z.B. einer fremd verwalteten Mannschaft in
  // einem anderen Container-Verein) ist evtl. kein Club-Admin und sieht die
  // Club-weite Inbox nicht — hier sieht er die Anfragen für seine Mannschaft.
  const [clubRow, licenseRow, invitations, sponsorRows, inquiries] = await Promise.all([
    getClubById(club.id),
    getTeamLicensePlanDirect(team.id),
    listInvitationsForTeam(team.id),
    listSponsorsForTeam(team.id),
    listPendingInquiriesForTeam(team.id)
  ]);

  // Verifikations-Scope analog zur Setup-Checkliste: Vereinslizenz verifiziert
  // den Verein (Teams erben), Einzel-Mannschaft (basic/pro) verifiziert sich selbst.
  const isVereinslizenz = licenseRow?.plan === "verein";
  const isVerified = isVereinslizenz
    ? !!clubRow?.verifiedAt
    : !!team.verifiedAt;
  const verifyEntity: "Mannschaft" | "Verein" = isVereinslizenz
    ? "Verein"
    : "Mannschaft";
  const verifyHref = isVereinslizenz
    ? `/verein/${slug}/verifikation`
    : `/verein/${slug}/mannschaft/${teamId}/verifikation`;
  const canInvite = role === "admin" || role === "trainer";
  const pendingToken = invitations.find((i) => i.status === "pending")?.token ?? null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Sponsoren
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Alle Sponsoren von {team.name} — einladen, verwalten, Beiträge im Blick behalten.
        </p>
      </div>

      <SponsorInviteCard
        teamId={team.id}
        slug={slug}
        initialToken={pendingToken}
        isVerified={isVerified}
        canInvite={canInvite}
        verifyEntity={verifyEntity}
        verifyHref={verifyHref}
      />

      {/* Offene Sponsor-Anfragen aus der öffentlichen Suche — nur Admins können
          antworten (Annehmen erzeugt eine Einladung). */}
      {role === "admin" && inquiries.length > 0 && (
        <InquiriesInbox
          inquiries={inquiries.map((i) => ({
            ...i,
            teamName: i.teamName ?? team.name,
            sponsorName: i.sponsorName ?? null
          }))}
        />
      )}

      <section className="space-y-3">
        <h3 className="font-display font-bold text-lg tracking-tight text-brand-night-navy">
          Deine Sponsoren ({sponsorRows.length})
        </h3>

        {sponsorRows.length === 0 ? (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
            Noch keine Sponsoren. Teile den Einladungslink oben — sobald sich jemand
            registriert und einen Pact anlegt, erscheint er hier.
          </div>
        ) : (
          <ul className="space-y-2">
            {sponsorRows.map((s) => (
              <li key={s.sponsorId}>
                <Link
                  href={`/verein/${slug}/sponsor/${s.sponsorId}`}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-white shadow-ios-card p-4 hover:border-accent/40 hover:bg-brand-off-white/60 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-brand-night-navy truncate">
                      {s.displayName}
                    </div>
                    <div className="mt-0.5 text-xs text-brand-night-navy/60">
                      {s.activePacts} aktive{s.activePacts === 1 ? "r" : ""} Pact
                      {s.activePacts === 1 ? "" : "s"}
                      {s.totalPacts > s.activePacts && ` · ${s.totalPacts} gesamt`}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono tabular-nums font-semibold text-accent">
                      {eur(s.chargedCents)}
                    </div>
                    <div className="text-[0.65rem] uppercase tracking-widest text-brand-night-navy/60">
                      abgerechnet
                    </div>
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
