import Link from "next/link";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listRosterForTeam, getTeamInClub } from "@/lib/db/queries/team-lifecycle";
import { RosterList } from "./_components/roster-list";

export const metadata = { title: "Spieler · Mannschaft · KickPact" };

/**
 * Spieler-Roster mit DSGVO-Block-Toggle.
 *
 * Crawler-Anonymisierung (Phase 4 / Task 4.7) blockt bereits Updates. Hier
 * können Trainer und Admins manuell blockieren (z.B. nach interner
 * Datenschutz-Anfrage).
 */
export default async function SpielerPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  // Lesen ist viewer-OK; Block-Toggle prüft separat (trainer-Level) in der
  // Server-Action.
  const { club, role } = await assertTeamPageAccess(slug, teamId, "viewer");

  const team = await getTeamInClub(teamId, club.id);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  const roster = await listRosterForTeam(team.id);
  const canEdit = role === "admin" || role === "trainer";

  const activePlayers = roster.filter((p) => !p.blocked);
  const blockedPlayers = roster.filter((p) => p.blocked);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/verein/${slug}/mannschaft/${teamId}`}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← {team.name}
        </Link>
        <h2 className="mt-1.5 font-display font-bold text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Spieler
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          {roster.length} Spieler · {activePlayers.length} aktiv ·{" "}
          {blockedPlayers.length} anonymisiert
        </p>
      </div>

      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/70">
        <p>
          <strong>DSGVO-Hinweis:</strong> Spielernamen werden automatisch aus
          öffentlichen Spieldaten übernommen. Wenn ein Spieler nicht öffentlich
          gelistet werden möchte, blockiere ihn hier — der Name wird sofort durch
          „Anonymisiert" ersetzt und künftige automatische Updates werden ignoriert.
        </p>
      </div>

      {roster.length === 0 ? (
        <div className="rounded-lg bg-white shadow-ios-card p-6 text-sm text-brand-night-navy/60">
          Noch keine Spieler. Spieler werden automatisch angelegt, sobald die
          ersten Spieldaten erfasst wurden.
        </div>
      ) : (
        <RosterList
          players={roster}
          canEdit={canEdit}
          clubSlug={slug}
          teamId={teamId}
        />
      )}
    </div>
  );
}
