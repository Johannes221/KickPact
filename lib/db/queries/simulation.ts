/**
 * W3 (Saison-Features 2026-06-12) — DB-Wrapper der Geld-Simulation.
 *
 * Lädt die GESPIELTEN Spiele (+ Events) eines Saison-Fensters einer Mannschaft
 * und füttert den puren Simulations-Kern (`lib/simulation/pact-simulation`).
 * teamSide wird — wie in evaluate-match — via `detectTeamSide` aus Team- UND
 * Vereinsname bestimmt.
 */
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { nextSaisonCode, saisonStartDate } from "@/lib/utils/saison";
import {
  simulateRulesOverMatches,
  type SimMatch,
  type SimRule,
  type SimulationResult
} from "@/lib/simulation/pact-simulation";

/**
 * Simuliert `rules` über alle finished-Spiele der Mannschaft im Fenster der
 * Saison `saison` (Code wie "2526" → [1.7.2025, 1.7.2026)).
 *
 * `null` bei unbekanntem Team oder ungültigem Saison-Code; sonst immer ein
 * Result (matchCount 0, wenn das Fenster leer ist — Aufrufer blenden dann aus).
 */
export async function simulateForTeamSeason(
  teamId: string,
  saison: string,
  rules: SimRule[]
): Promise<SimulationResult | null> {
  const [team] = await db
    .select({ name: teams.name, clubName: clubs.name })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const from = saisonStartDate(saison);
  const next = nextSaisonCode(saison);
  const to = next ? saisonStartDate(next) : null;
  if (!from || !to) return null;

  const rows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.teamId, teamId),
        eq(matches.status, "finished"),
        gte(matches.datum, from),
        lt(matches.datum, to)
      )
    )
    .orderBy(asc(matches.datum));

  // Nur Spiele mit echtem Endstand — ohne Ergebnis kann die Engine nichts
  // Ehrliches bewerten (kein „0:0"-Phantom aus NULL-Werten).
  const withResult = rows.filter(
    (m) => m.ergebnisHeim !== null && m.ergebnisGast !== null
  );

  const matchIds = withResult.map((m) => m.id);
  const events =
    matchIds.length > 0
      ? await db.select().from(matchEvents).where(inArray(matchEvents.matchId, matchIds))
      : [];
  const eventsByMatch = new Map<string, typeof events>();
  for (const e of events) {
    const list = eventsByMatch.get(e.matchId) ?? [];
    list.push(e);
    eventsByMatch.set(e.matchId, list);
  }

  const names = [team.name, team.clubName];
  const simMatches: SimMatch[] = withResult.map((m) => ({
    id: m.id,
    teamSide: detectTeamSide(names, m.heimName),
    ergebnisHeim: m.ergebnisHeim!,
    ergebnisGast: m.ergebnisGast!,
    halbzeitHeim: m.halbzeitHeim,
    halbzeitGast: m.halbzeitGast,
    datum: m.datum,
    events: (eventsByMatch.get(m.id) ?? []).map((e) => ({
      id: e.id,
      type: e.type,
      subtype: e.subtype,
      minute: e.minute,
      side: e.side,
      playerName: e.playerName,
      playerId: e.playerId,
      source: e.source
    }))
  }));

  return simulateRulesOverMatches(simMatches, rules);
}
