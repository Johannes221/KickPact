import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getDocumentSignedUrl } from "@/lib/storage/documents";
import { listTeamImages } from "@/lib/db/queries/team-images";
import { PublicProfileForm } from "./_components/public-profile-form";
import { MediaManager } from "./_components/media-manager";

export const metadata = { title: "Öffentliches Profil · Mannschaft · KickPact" };

/**
 * Editor für das öffentliche Mannschafts-Profil (/m/{slug}).
 * Felder: Öffentlich-Toggle, Anzeigename, Kurzbeschreibung, Ziele.
 * Logo wird in den Stammdaten gepflegt und hier nur vorgeschaut.
 */
export default async function TeamProfilPage({
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
      discoverable: teams.discoverable,
      publicSlug: teams.publicSlug,
      publicName: teams.publicName,
      publicTagline: teams.publicTagline,
      publicGoals: teams.publicGoals,
      logoUrl: teams.logoUrl,
      coverUrl: teams.coverUrl,
      showInsights: teams.showInsights,
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

  let logoDisplayUrl: string | null = null;
  if (team.logoUrl) {
    try {
      logoDisplayUrl = await getDocumentSignedUrl(team.logoUrl, 3600);
    } catch {
      logoDisplayUrl = null;
    }
  }

  // Galerie-Bilder laden und Serve-Endpoint-URLs bauen (stabil, kein Ablauf).
  const galleryRows = await listTeamImages(teamId);
  const gallery = galleryRows.map((g) => ({
    id: g.id,
    url: `/api/teams/${teamId}/image?slot=gallery&id=${g.id}`,
  }));

  // Cover-URL über den Serve-Endpoint (stable, team-scoped).
  const coverDisplayUrl = team.coverUrl
    ? `/api/teams/${teamId}/image?slot=cover`
    : null;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
          Öffentliches Profil
        </h2>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Werde öffentlich, damit Sponsoren {team.name} finden und direkt
          anfragen können. Du bekommst eine teilbare Profil-URL.
        </p>
      </div>

      <PublicProfileForm
        teamId={team.id}
        teamName={team.name}
        initial={{
          isPublic: team.discoverable,
          publicSlug: team.publicSlug,
          publicName: team.publicName ?? "",
          publicTagline: team.publicTagline ?? "",
          publicGoals: team.publicGoals ?? ""
        }}
        logoUrl={logoDisplayUrl}
        einstellungenHref={`/verein/${slug}/mannschaft/${teamId}/einstellungen`}
      />

      <hr className="border-brand-neutral/20" />

      <MediaManager
        teamId={team.id}
        coverUrl={coverDisplayUrl}
        gallery={gallery}
        showInsights={team.showInsights}
      />
    </div>
  );
}
