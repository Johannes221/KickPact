/**
 * Baut die URL zum öffentlichen Wappen-Endpoint (`/api/crest`) für ein Team-
 * Badge in einer Match-Ansicht. Externe Gegner haben am Match-Record oft keine
 * fussball.de-team-id (nur den Namen), deshalb ist `name` Pflicht und `team`
 * optional — der Endpoint löst `team` bevorzugt auf und fällt sonst auf den
 * Namen zurück. Fehlt beides bzw. gibt es kein Wappen, liefert der Endpoint 404
 * und `TeamCrest` zeigt seinen Platzhalter.
 */
export function crestSrc(name: string, fussballdeTeamId?: string | null): string {
  const params = new URLSearchParams();
  if (fussballdeTeamId) params.set("team", fussballdeTeamId);
  params.set("name", name);
  return `/api/crest?${params.toString()}`;
}
