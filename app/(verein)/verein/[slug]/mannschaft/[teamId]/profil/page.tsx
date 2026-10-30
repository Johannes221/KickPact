import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listTeamImages } from "@/lib/db/queries/team-images";
import { getTeamProfileForEditor } from "@/lib/db/queries/team-lifecycle";
import { getClubNameOrt } from "@/lib/db/queries/club-admin";
import { getSubscriptionGateForTeam } from "@/lib/db/queries/subscription-status";
import { getTeamLicensePlan } from "@/lib/db/queries/pledges";
import { lockFromGate } from "@/lib/billing/upgrade-offer";
import { isNativeAppRequest } from "@/lib/platform/native-server";
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

  // Abo-Sperre + Tarif + Plattform serverseitig auflösen und als Props
  // durchreichen: der Editor kann so bei jeder gesperrten Aktion sofort die
  // echte Upgrade-Aufforderung zeigen (statt erst den Server zu fragen und
  // einen kryptischen Fehler-Toast zu ernten). `nativeApp` MUSS serverseitig
  // kommen (Anti-Steering-Wording ohne Hydration-Flackern).
  const [gate, currentPlan, nativeApp] = await Promise.all([
    getSubscriptionGateForTeam(teamId),
    getTeamLicensePlan(teamId),
    isNativeAppRequest()
  ]);

  const gallery = (await listTeamImages(teamId)).map((g) => ({
    id: g.id,
    url: `/api/teams/${teamId}/image?slot=gallery&id=${g.id}`
  }));
  const coverUrl = team.coverUrl
    ? `/api/teams/${teamId}/image?slot=cover`
    : null;
  const logoUrl = team.logoUrl ? `/api/teams/${teamId}/image?slot=logo` : null;

  return (
    <div className="space-y-3">
      <MeinProfilEditor
      slug={slug}
      teamId={team.id}
      teamName={team.name}
      fussballdeTeamId={team.fussballdeTeamId}
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
      lock={lockFromGate(gate)}
      currentPlan={currentPlan}
      nativeApp={nativeApp}
      />
    </div>
  );
}
