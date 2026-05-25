import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { assertClubAccess } from "@/lib/auth/scope";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { TeamSubNav } from "./_components/team-sub-nav";

/**
 * Team-Scope-Layout für Mannschafts-Admins.
 *
 * Lädt einmal Team- + Club-Header-Daten und mountet die TeamSubNav, die
 * zwischen Übersicht / Pacts / Spiele / Finanzen / Abo / Einstellungen
 * navigiert. Auth-Check minimal über assertClubAccess; der Plan-spezifische
 * Redirect (basic/pro vs verein) sitzt im Club-Layout darüber.
 *
 * `effectivePlan` wird via `getUserIdentities` für genau diesen Club aufgelöst
 * und an `TeamSubNav` durchgereicht: Bei Vereinslizenz blendet das Team-Menü
 * `Abo` + `Einstellungen` aus (die leben dann im Vereins-SubNav darüber).
 */
export default async function TeamScopeLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club, user } = await assertClubAccess(slug, "viewer");

  const [team] = await db
    .select({ name: teams.name, clubId: teams.clubId })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  // Fall-through wenn Team nicht zum Club gehört oder nicht existiert —
  // die Page selbst rendert dann den "nicht gefunden"-Block.
  const teamName = team?.name ?? "Mannschaft";

  // Effective-Plan dieses Clubs auflösen (verein > pro > basic).
  // Bei Lookup-Fehler oder fehlender Identity-Row → null (Tab-Filter behält
  // volles Set, das ist semantisch der sichere Default).
  let effectivePlan: "basic" | "pro" | "verein" | null = null;
  try {
    const ids = await getUserIdentities(user.id);
    effectivePlan =
      ids.clubs.find((c) => c.clubId === club.id)?.effectivePlan ?? null;
  } catch {
    // Layout darf nicht wegen Identity-Lookup kippen.
  }

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      <TeamSubNav
        slug={slug}
        teamId={teamId}
        teamName={teamName}
        clubName={club.name}
        effectivePlan={effectivePlan}
      />
      {children}
    </div>
  );
}
