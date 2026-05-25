import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { TeamSubNav } from "./_components/team-sub-nav";

/**
 * Team-Scope-Layout für Mannschafts-Admins.
 *
 * Lädt einmal Team- + Club-Header-Daten und mountet die TeamSubNav, die
 * zwischen Übersicht / Pacts / Spiele / Finanzen / Abo / Einstellungen
 * navigiert. Auth-Check minimal über assertClubAccess; der Plan-spezifische
 * Redirect (basic/pro vs verein) sitzt im Club-Layout darüber.
 */
export default async function TeamScopeLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertClubAccess(slug, "viewer");

  const [team] = await db
    .select({ name: teams.name, clubId: teams.clubId })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  // Fall-through wenn Team nicht zum Club gehört oder nicht existiert —
  // die Page selbst rendert dann den "nicht gefunden"-Block.
  const teamName = team?.name ?? "Mannschaft";

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      <TeamSubNav
        slug={slug}
        teamId={teamId}
        teamName={teamName}
        clubName={club.name}
      />
      {children}
    </div>
  );
}
