import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { getActiveVerificationForClub } from "@/lib/db/queries/verifications";
import { VerificationBanner } from "@/components/shared/verification-banner";
import { TeamSubNav } from "./_components/team-sub-nav";

/**
 * Team-Scope-Layout für Mannschafts-Trainer + Verein-Admins.
 *
 * Lädt einmal Team- + Club-Header-Daten und mountet die TeamSubNav, die
 * zwischen Übersicht / Pacts / Spiele / Finanzen / Abo / Einstellungen
 * navigiert. Auth-Check über `assertTeamPageAccess`: erlaubt sowohl Club-Scope
 * (Verein-Admin/-Trainer) als auch reinen Team-Scope (Team-Trainer ohne
 * Club-Membership) und leitet bei falschem Slug auf die korrekte URL um.
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
  const { club, user } = await assertTeamPageAccess(slug, teamId, "viewer");

  const [team] = await db
    .select({ name: teams.name, clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  // Fall-through wenn Team nicht zum Club gehört oder nicht existiert —
  // die Page selbst rendert dann den "nicht gefunden"-Block.
  const teamName = team?.name ?? "Mannschaft";

  // Verifikations-Gate (Spec 2026-05-29 §3.2): `clubs.verifiedAt` des Container-
  // Vereins ist das einzige Gate. Solange der Container nicht verifiziert ist,
  // Banner mit dem aktuellen Club-Einreichungs-Status zeigen. Rechnungen werden
  // bis zur Freigabe zurückgehalten (Withhold-Gate in der Invoice-Generierung).
  const [containerClub] = team
    ? await db
        .select({ verifiedAt: clubs.verifiedAt })
        .from(clubs)
        .where(eq(clubs.id, team.clubId))
        .limit(1)
    : [];
  const clubUnverified = !!team && !containerClub?.verifiedAt;
  const clubVerification = clubUnverified
    ? await getActiveVerificationForClub(team.clubId)
    : null;

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
      {clubUnverified && (
        <VerificationBanner
          uploadUrl={`/verein/${slug}/verifikation`}
          verification={clubVerification}
          scope="verein"
        />
      )}
      {children}
    </div>
  );
}
