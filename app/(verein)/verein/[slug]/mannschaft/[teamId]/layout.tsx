import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { getTeamNameById } from "@/lib/db/queries/team-lifecycle";
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

  // Fall-through wenn Team nicht zum Club gehört oder nicht existiert —
  // die Page selbst rendert dann den "nicht gefunden"-Block.
  const teamName = (await getTeamNameById(teamId)) ?? "Mannschaft";

  // Hinweis: Das Verifikations-Gate (Container-Verein nicht verifiziert) wird
  // jetzt zentral im Vereins-Layout über die gebündelte StatusBar angezeigt —
  // hier kein separater Banner mehr.

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
    <div className="mx-auto max-w-6xl py-2 md:py-4 space-y-4 md:space-y-5">
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
