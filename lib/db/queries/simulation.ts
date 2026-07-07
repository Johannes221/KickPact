/**
 * W3 (Saison-Features 2026-06-12) — DB-Wrapper der Geld-Simulation.
 *
 * Lädt die GESPIELTEN Spiele (+ Events) eines Saison-Fensters einer Mannschaft
 * und füttert den puren Simulations-Kern (`lib/simulation/pact-simulation`).
 * teamSide wird — wie in evaluate-match — via `detectTeamSide` aus Team- UND
 * Vereinsname bestimmt.
 */
import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, pledges, pledgeRules, charges } from "@/lib/db/schema";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { resolveTeamSide } from "@/lib/crawler/team-side";
import { nextSaisonCode, prevSaisonCode, saisonLabel, saisonStartDate } from "@/lib/utils/saison";
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
    .select({
      name: teams.name,
      clubName: clubs.name,
      fussballdeTeamId: teams.fussballdeTeamId
    })
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
    teamSide: resolveTeamSide(m, team.fussballdeTeamId, names),
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

export interface TeamPrognose {
  /** Vorsaison-Code ("2526") + UI-Label ("25/26"). */
  prevSaison: string;
  prevSaisonLabel: string;
  /** (a) Was die AKTUELL aktiven Pacts über die Vorsaison gebracht hätten. */
  lastSeason: { totalCents: number; matchCount: number } | null;
  /** (b) Lineare Hochrechnung der laufenden Saison (ab 3 gespielten Spielen). */
  onPace: {
    projectedCents: number;
    currentCents: number;
    playedCount: number;
    expectedGames: number;
  } | null;
}

/**
 * W3.3 — Daten der „Prognose"-Karte auf dem Team-Dashboard.
 *
 * (a) Rückblick: die aktiven Regeln (active=true, aktuelle Term-Version) aller
 *     AKTIVEN Pledges des Teams, simuliert über die Vorsaison. Nur gesetzt,
 *     wenn die Simulation Spiele UND einen Betrag > 0 ergab.
 * (b) Hochrechnung: bestätigte + fakturierte Spiel-Beiträge der laufenden
 *     Saison, linear auf die erwartete Spielzahl (= Vorsaison-Spielzahl,
 *     Fallback 26, nie kleiner als bereits gespielt) hochgerechnet. Erst ab
 *     3 gespielten Spielen und nur bei Beiträgen > 0 — vorher wäre die Linie
 *     reine Münzwurf-Mathematik.
 *
 * `null`, wenn weder (a) noch (b) Daten hat (Karte wird nicht gerendert).
 */
export async function getTeamPrognose(teamId: string): Promise<TeamPrognose | null> {
  const [team] = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;
  const prevSaison = prevSaisonCode(team.saison);
  const seasonStart = saisonStartDate(team.saison);
  if (!prevSaison || !seasonStart) return null;

  // (a) Aktive Regeln aller aktiven Pacts in der aktuellen Term-Version
  // (effectiveUntil IS NULL — alte, geklonte Konditionen zählen nicht).
  const ruleRows = await db
    .select({
      id: pledgeRules.id,
      pledgeId: pledgeRules.pledgeId,
      triggerType: pledgeRules.triggerType,
      triggerParams: pledgeRules.triggerParamsJson,
      amountCents: pledgeRules.amountCents,
      capCents: pledgeRules.capCents,
      capPeriod: pledgeRules.capPeriod,
      monthlyCapCents: pledges.monthlyCapCents
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        eq(pledges.status, "active"),
        eq(pledgeRules.active, true),
        isNull(pledgeRules.effectiveUntil)
      )
    );

  let lastSeason: TeamPrognose["lastSeason"] = null;
  if (ruleRows.length > 0) {
    const sim = await simulateForTeamSeason(
      teamId,
      prevSaison,
      ruleRows.map((r) => ({
        id: r.id,
        pledgeId: r.pledgeId,
        triggerType: r.triggerType,
        triggerParams: r.triggerParams ?? {},
        amountCents: r.amountCents,
        capCents: r.capCents,
        capPeriod: r.capPeriod,
        monthlyCapCents: r.monthlyCapCents
      }))
    );
    if (sim && sim.matchCount > 0 && sim.totalCents > 0) {
      lastSeason = { totalCents: sim.totalCents, matchCount: sim.matchCount };
    }
  }

  // (b) Hochrechnung der laufenden Saison.
  let onPace: TeamPrognose["onPace"] = null;
  const [playedRow] = await db
    .select({ played: sql<number>`count(*)::int` })
    .from(matches)
    .where(
      and(
        eq(matches.teamId, teamId),
        eq(matches.status, "finished"),
        gte(matches.datum, seasonStart)
      )
    );
  const playedCount = playedRow?.played ?? 0;
  if (playedCount >= 3) {
    // Spiel-Beiträge der Saison: confirmed + invoiced (eine bezahlte Rechnung
    // lässt ihre Charges auf "invoiced" — damit sind alle „echten" Beiträge
    // abgedeckt, pending/cancelled bleiben draußen). Saison-Ziel-Charges
    // (matchId NULL) fallen erst am Saison-Ende an und bleiben bewusst raus.
    const [sumRow] = await db
      .select({ total: sql<number>`coalesce(sum(${charges.amountCents}), 0)::int` })
      .from(charges)
      .innerJoin(matches, eq(charges.matchId, matches.id))
      .where(
        and(
          eq(matches.teamId, teamId),
          gte(matches.datum, seasonStart),
          inArray(charges.status, ["confirmed", "invoiced"])
        )
      );
    const currentCents = sumRow?.total ?? 0;

    if (currentCents > 0) {
      const prevStart = saisonStartDate(prevSaison);
      const [prevRow] = prevStart
        ? await db
            .select({ played: sql<number>`count(*)::int` })
            .from(matches)
            .where(
              and(
                eq(matches.teamId, teamId),
                eq(matches.status, "finished"),
                gte(matches.datum, prevStart),
                lt(matches.datum, seasonStart)
              )
            )
        : [{ played: 0 }];
      const prevPlayed = prevRow?.played ?? 0;
      const expectedGames = Math.max(prevPlayed > 0 ? prevPlayed : 26, playedCount);
      onPace = {
        projectedCents: Math.round((currentCents / playedCount) * expectedGames),
        currentCents,
        playedCount,
        expectedGames
      };
    }
  }

  if (!lastSeason && !onPace) return null;
  return {
    prevSaison,
    prevSaisonLabel: saisonLabel(prevSaison),
    lastSeason,
    onPace
  };
}
