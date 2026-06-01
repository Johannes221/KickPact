import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema";
import { teamLicenses } from "@/lib/db/schema/billing";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listInvitationsForTeam } from "@/lib/db/queries/invitations";
import { listSponsorsForTeam } from "@/lib/db/queries/team-dashboard";
import { SponsorInviteCard } from "./_components/sponsor-invite-card";

export const metadata = { title: "Sponsoren · KickPact" };

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function TeamSponsorenPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club, role } = await assertTeamPageAccess(slug, teamId, "viewer");

  const [team] = await db
    .select({ id: teams.id, name: teams.name, verifiedAt: teams.verifiedAt })
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

  const [[clubRow], [licenseRow], invitations, sponsorRows] = await Promise.all([
    db.select({ verifiedAt: clubs.verifiedAt }).from(clubs).where(eq(clubs.id, club.id)).limit(1),
    db.select({ plan: teamLicenses.plan }).from(teamLicenses).where(eq(teamLicenses.teamId, team.id)).limit(1),
    listInvitationsForTeam(team.id),
    listSponsorsForTeam(team.id)
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
        <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
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

      <section className="space-y-3">
        <h3 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
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
                  className="flex items-center justify-between gap-3 rounded-2xl border border-brand-neutral/40 bg-white p-4 hover:border-accent/40 hover:bg-brand-off-white/60 transition-colors"
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
                    <div className="text-[0.65rem] uppercase tracking-widest text-brand-night-navy/40">
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
