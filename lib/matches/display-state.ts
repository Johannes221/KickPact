/**
 * Anzeige-Zustand eines Spiels — pure, ohne DB.
 *
 * EINE Quelle für Spiele-Liste (`.../mannschaft/[teamId]/spiele`) und
 * Detailansicht (`MatchDetailView`): „kommend" darf nicht an zwei Stellen
 * unterschiedlich definiert sein, sonst verlinkt die Liste ein Spiel als
 * gespielt, das die Detailseite als Vorschau rendert (oder umgekehrt).
 */

export interface MatchDisplayInput {
  status: "scheduled" | "live" | "finished" | "cancelled" | "postponed";
  datum: Date;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
}

/**
 * Endstand liegt vor → Spielbericht (Ergebnis, Events, Beiträge) statt Vorschau.
 * Bewusst am Ergebnis festgemacht, nicht am Status: fussball.de trägt das
 * Ergebnis oft erst Tage nach dem Anstoß nach, bis dahin bleibt die Row
 * `scheduled` (siehe paginateTeamGames — Status kommt vom Endpoint, nicht vom
 * Datum).
 */
export function hasResult(
  m: Pick<MatchDisplayInput, "ergebnisHeim" | "ergebnisGast">
): boolean {
  return m.ergebnisHeim !== null && m.ergebnisGast !== null;
}

/**
 * Dürfen Ereignisse gemeldet / darf das Ergebnis überschrieben werden?
 *
 * ZUKUNFTS-SPERRE: Für ein Spiel, dessen Anstoß noch bevorsteht, ist das
 * bewusst GESPERRT — es gibt nichts zu melden, und ein manuelles Tor auf einem
 * ungespielten Spiel hätte keinen offiziellen Endstand als Gegenprobe (die
 * Scoreline-Reconciliation in `addManualEvent` greift erst bei `finished`).
 * Ein bereits angepfiffenes `scheduled`-Spiel bleibt erlaubt: der Verein soll
 * melden können, bevor fussball.de das Ergebnis nachträgt.
 *
 * Semantik 1:1 wie das frühere inline-`isPlayed` in MatchDetailView.
 */
export function canReportMatchEvents(
  m: Pick<MatchDisplayInput, "status" | "datum">,
  now: Date = new Date()
): boolean {
  if (m.status === "cancelled" || m.status === "postponed") return false;
  return m.status === "finished" || m.datum.getTime() < now.getTime();
}

/**
 * Angesetzt und Anstoß steht noch bevor → Vorschau statt Spielbericht: kein
 * Ergebnis, keine Events, kein Melden-UI. Abgesagte/verlegte Spiele sind NICHT
 * „kommend" — für sie gibt es keinen Termin, auf den man sich freuen könnte.
 */
export function isUpcomingMatch(
  m: MatchDisplayInput,
  now: Date = new Date()
): boolean {
  if (m.status === "cancelled" || m.status === "postponed") return false;
  return !hasResult(m) && m.datum.getTime() >= now.getTime();
}
