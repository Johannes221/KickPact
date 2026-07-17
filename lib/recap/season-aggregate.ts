import type { LeagueStandingRow } from "@/lib/crawler/fussballde";

/**
 * EINE Regel dafür, woher die Saison-Zahlen einer Mannschaft stammen — genutzt
 * vom Wrapped, vom Team-Dashboard und vom öffentlichen Profil.
 *
 * Hintergrund: der Spielplan-Endpunkt liefert nur ~10 Spiele, wenn kein
 * Vorsaison-Backfill lief. Die Liga-Tabelle kennt dagegen die volle Saison — sie
 * ist die verlässlichere Quelle für die großen Aggregate. Am 2026-07-17
 * verifiziert: Dossenheim hatte 10 Spiele in der DB, aber 34 in der Tabelle.
 *
 * Aber nicht jede Tabelle ist eine Saison: Jugend-Ligen laufen in getrennten
 * Vor-/Endrunden-Staffeln. Die B-Junioren-Kreisliga führte 8 Spiele, während die
 * Mannschaft 22 gespielt hatte — diese Tabelle zu übernehmen würde belegte
 * Spiele wegwerfen. Daher: die Tabelle gilt nur, wenn sie mindestens so viele
 * Spiele kennt wie wir selbst belegen können. Im Zweifel gewinnt die größere
 * belegte Menge.
 *
 * Es wird nie hochgerechnet: jede Zahl ist entweder Tabelle (verifiziert) oder
 * ausgewertete Spiele (verifiziert). `source` macht die Basis nach außen
 * kenntlich, damit die UI keine Saison behauptet, die sie nicht belegen kann
 * (siehe `lib/recap/aggregate-scope.ts`).
 *
 * Browser-frei (nur Typ-Import) — nutzbar in Server Components und Query-Layern.
 */

/** Bilanz/Tore, wie sie sich aus den ausgewerteten Spielen ergeben. */
export interface MatchDerivedStats {
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  toreFor: number;
  toreAgainst: number;
}

export interface SeasonAggregate extends MatchDerivedStats {
  /** Nur gesetzt, wenn die Tabelle die Quelle ist — sonst behaupten wir keinen Platz. */
  tabellenplatz: number | null;
  teamsInLeague: number | null;
  punkte: number | null;
  source: "table" | "matches";
}

/**
 * Deckt die Tabellenzeile mindestens das ab, was wir selbst belegen können?
 *
 * `spiele > 0` ist keine Formalie: zum Saisonstart veröffentlicht fussball.de die
 * neue Tabelle mit 0 Spielen und ALPHABETISCH sortierten Plätzen (2026-07-17
 * live: alle Teams auf Platz 1). Ohne diese Untergrenze wäre `0 >= 0` erfüllt
 * und das öffentliche Profil behauptete „Platz 1." über einer 0:0-Bilanz.
 */
export function tableCoversSeason(
  own: LeagueStandingRow | null | undefined,
  verifiedMatchCount: number
): boolean {
  return Boolean(own && own.spiele > 0 && own.spiele >= verifiedMatchCount);
}

export function resolveSeasonAggregate(
  fromMatches: MatchDerivedStats,
  standings: {
    ownRow: LeagueStandingRow | null;
    teamsInLeague: number;
  } | null
): SeasonAggregate {
  const own = standings?.ownRow ?? null;
  if (!standings || !tableCoversSeason(own, fromMatches.spiele) || !own) {
    return {
      ...fromMatches,
      tabellenplatz: null,
      teamsInLeague: null,
      punkte: null,
      source: "matches"
    };
  }
  return {
    spiele: own.spiele,
    siege: own.siege,
    unentschieden: own.unentschieden,
    niederlagen: own.niederlagen,
    toreFor: own.toreFor,
    toreAgainst: own.toreAgainst,
    tabellenplatz: own.position,
    teamsInLeague: standings.teamsInLeague,
    punkte: own.punkte,
    source: "table"
  };
}
