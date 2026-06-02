import { MatchDetailView } from "./_components/match-detail-view";

export const metadata = { title: "Spiel · KickPact" };

/**
 * Club-scoped Spiel-Detailroute. Der Access-Check (Match scoped per Slug laden,
 * danach team-aware autorisieren) lebt vollständig in `MatchDetailView` — diese
 * Page reicht nur Slug/MatchId durch und setzt den Zurück-Link auf das
 * Vereins-Dashboard.
 */
export default async function MatchDetailPage({
  params
}: {
  params: Promise<{ slug: string; matchId: string }>;
}) {
  const { slug, matchId } = await params;
  return <MatchDetailView slug={slug} matchId={matchId} backHref={`/verein/${slug}`} />;
}
