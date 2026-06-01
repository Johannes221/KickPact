import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listTeamImages } from "@/lib/db/queries/team-images";
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

  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      league: teams.league,
      discoverable: teams.discoverable,
      publicSlug: teams.publicSlug,
      publicName: teams.publicName,
      publicTagline: teams.publicTagline,
      publicGoals: teams.publicGoals,
      logoUrl: teams.logoUrl,
      coverUrl: teams.coverUrl,
      showInsights: teams.showInsights,
      verifiedAt: teams.verifiedAt
    })
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

  const [clubRow] = await db
    .select({ name: clubs.name, ort: clubs.ort })
    .from(clubs)
    .where(eq(clubs.id, club.id))
    .limit(1);

  const gallery = (await listTeamImages(teamId)).map((g) => ({
    id: g.id,
    url: `/api/teams/${teamId}/image?slot=gallery&id=${g.id}`
  }));
  const coverUrl = team.coverUrl
    ? `/api/teams/${teamId}/image?slot=cover`
    : null;
  const logoUrl = team.logoUrl ? `/api/teams/${teamId}/image?slot=logo` : null;

  return (
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
  );
}
