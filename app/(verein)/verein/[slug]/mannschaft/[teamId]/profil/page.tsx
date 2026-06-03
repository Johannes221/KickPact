import { Wallet, Gem, Settings } from "lucide-react";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listTeamImages } from "@/lib/db/queries/team-images";
import { getTeamProfileForEditor } from "@/lib/db/queries/team-lifecycle";
import { getClubNameOrt } from "@/lib/db/queries/club-admin";
import { SettingsButton, type SettingsNavItem } from "@/components/shared/settings-button";
import { MeinProfilEditor } from "./_components/mein-profil-editor";

export const metadata = { title: "Mein Profil · Mannschaft · KickPact" };

/**
 * „Mein Profil" — WYSIWYG-Edit-Ansicht im Look der öffentlichen Seite
 * (/m/{publicSlug}), aber mit Edit-Bedienelementen (Cover/Logo/Name/Galerie/
 * Insights/Über uns + Verifikations-Zeile). Alle Schreibpfade nutzen die
 * bestehenden Server-Actions/Upload-Routes.
 */
export default async function MeinProfilPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "admin");

  const team = await getTeamProfileForEditor(teamId, club.id);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  const clubRow = await getClubNameOrt(club.id);

  const gallery = (await listTeamImages(teamId)).map((g) => ({
    id: g.id,
    url: `/api/teams/${teamId}/image?slot=gallery&id=${g.id}`
  }));
  const coverUrl = team.coverUrl
    ? `/api/teams/${teamId}/image?slot=cover`
    : null;
  const logoUrl = team.logoUrl ? `/api/teams/${teamId}/image?slot=logo` : null;

  // Zahnrad (Verwaltung + Konto + Logout) lebt im Profil-Tab — nicht auf jedem
  // Screen. Verwaltungs-Links team-scoped.
  const teamBase = `/verein/${slug}/mannschaft/${team.id}`;
  const settingsItems: SettingsNavItem[] = [
    { label: "Finanzen", href: `${teamBase}/finanzen`, icon: Wallet },
    { label: "Abo", href: `${teamBase}/abo`, icon: Gem },
    { label: "Einstellungen", href: `${teamBase}/einstellungen`, icon: Settings }
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end md:hidden">
        <SettingsButton contextLabel={team.name} overflowItems={settingsItems} />
      </div>
      <MeinProfilEditor
      slug={slug}
      teamId={team.id}
      teamName={team.name}
      saison={team.saison}
      league={team.league}
      clubName={clubRow?.name ?? ""}
      clubOrt={clubRow?.ort ?? null}
      isVerified={Boolean(team.verifiedAt)}
      coverUrl={coverUrl}
      logoUrl={logoUrl}
      gallery={gallery}
      showInsights={team.showInsights}
      discoverable={team.discoverable}
      publicSlug={team.publicSlug}
      publicName={team.publicName ?? ""}
      publicTagline={team.publicTagline ?? ""}
      publicGoals={team.publicGoals ?? ""}
      />
    </div>
  );
}
