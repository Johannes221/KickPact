/**
 * Ehrliche Bezugsgröße für Saison-Aggregate.
 *
 * Die großen Zahlen (Spiele, Bilanz, Tore) stammen entweder aus der Liga-Tabelle
 * — dann sind sie die volle, verifizierte Saison — oder nur aus den Spielen, die
 * wir tatsächlich ausgewertet haben. Letzteres kann deutlich weniger sein: der
 * Spielplan-Endpunkt liefert nur ~10 Spiele, wenn kein Vorsaison-Backfill lief.
 *
 * Ein als "Eure Bilanz" gelabeltes 4-1-5 aus 10 von 34 Spielen ist keine
 * Saison-Bilanz, sondern eine Falschaussage (verifiziert 2026-07-17: Dossenheim
 * zeigte 10 Spiele / 18 Tore statt der echten 34 Spiele / 62 Tore). Diese Helfer
 * benennen die Bezugsgröße, statt sie zu verschweigen — es wird nie
 * hochgerechnet, nur ausgewiesen, worauf sich die Zahl stützt.
 *
 * Welche Quelle gilt, entscheidet `lib/recap/season-aggregate.ts`.
 *
 * Reiner String-Helfer, absichtlich ohne Imports — nutzbar in Client-Slides,
 * next/og-Routen und Server-Komponenten gleichermaßen.
 */

export type AggregateSource = "table" | "matches";

/** Ist die Zahl die volle, per Liga-Tabelle verifizierte Saison? */
export function isFullSeason(source: AggregateSource): boolean {
  return source === "table";
}

/**
 * "1 ausgewertetes Spiel" / "10 ausgewertete Spiele" — im Nominativ.
 * Zentral, weil die Beugung sonst an jeder Aufrufstelle neu (und irgendwann
 * falsch) passiert: live stand am 2026-07-17 „1 AUSGEWERTETE SPIELE" auf einem
 * öffentlichen Profil, weil genau eine der drei Stellen sie vergessen hatte.
 */
function evaluatedMatches(spiele: number): string {
  return `${spiele} ${spiele === 1 ? "ausgewertetes Spiel" : "ausgewertete Spiele"}`;
}

/**
 * Bezugsgröße als Kicker über der Bilanz, z.B.
 *   Tabelle  → "34 Spiele auf dem Platz"
 *   Teilmenge → "10 ausgewertete Spiele"
 */
export function scopeKicker(source: AggregateSource, spiele: number): string {
  if (isFullSeason(source)) return `${spiele} Spiele auf dem Platz`;
  return evaluatedMatches(spiele);
}

/**
 * Nachsatz, der eine Aussage an ihre Basis bindet, z.B.
 *   Tabelle  → "" (die ganze Saison, kein Zusatz nötig)
 *   Teilmenge → " in 10 ausgewerteten Spielen"
 * Bewusst mit führendem Leerzeichen, damit Aufrufer ihn direkt anhängen können.
 */
export function scopeSuffix(source: AggregateSource, spiele: number): string {
  if (isFullSeason(source)) return "";
  // Dativ: "in EINEM ausgewerteteM Spiel" / "in 10 ausgewerteteN Spielen".
  return spiele === 1
    ? " in 1 ausgewertetem Spiel"
    : ` in ${spiele} ausgewerteten Spielen`;
}

/** Überschrift der Bilanz. Ohne Tabelle darf hier NICHT "Saison" stehen. */
export function bilanzHeadline(source: AggregateSource): string {
  return isFullSeason(source) ? "Eure Bilanz" : "Eure Bilanz aus diesen Spielen";
}

/**
 * Überschrift eines Kennzahlen-Blocks (Dashboard, öffentliches Profil).
 * Ohne Tabelle beziehen sich die Kacheln nur auf die ausgewerteten Spiele —
 * dann darf dort keine vollständige Saison behauptet werden.
 */
export function statsHeading(source: AggregateSource, spiele: number): string {
  if (isFullSeason(source)) return "Saison-Insights";
  return `Insights · ${evaluatedMatches(spiele)}`;
}
