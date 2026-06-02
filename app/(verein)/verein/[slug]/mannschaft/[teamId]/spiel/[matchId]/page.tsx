import { assertTeamPageAccess } from "@/lib/auth/scope";
import { MatchDetailView } from "../../../../spiel/[matchId]/_components/match-detail-view";

export const metadata = { title: "Spiel · KickPact" };

/**
 * Team-scoped Spiel-Detailroute. Liegt unter dem Team-Layout, damit die
 * Team-Tab-Bar erhalten bleibt (kein Nav-Sprung in die Club-Tabs).
 *
 * Access wird zweifach abgesichert: `assertTeamPageAccess` prüft Slug + Team-
 * Zugehörigkeit (wie alle anderen Team-Sub-Routes, korrigiert auch falsche
 * Slugs), und `MatchDetailView` führt zusätzlich den match-bezogenen
 * team-aware Check (`resolveTeamAccess`) durch. Zurück-Link → Team-Spiele-Liste.
 */
export default async function TeamMatchDetailPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string; matchId: string }>;
}) {
  const { slug, teamId, matchId } = await params;
  await assertTeamPageAccess(slug, teamId, "viewer");

  return (
    <MatchDetailView
      slug={slug}
      matchId={matchId}
      backHref={`/verein/${slug}/mannschaft/${teamId}/spiele`}
    />
  );
}
