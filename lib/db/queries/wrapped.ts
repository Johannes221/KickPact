import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema/clubs";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { charges } from "@/lib/db/schema/charges";
import { pledges } from "@/lib/db/schema/pledges";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { evaluateTriggers, type MatchInput } from "@/lib/crawler/triggers";
import { saisonStartDate, nextSaisonCode, prevSaisonCode } from "@/lib/utils/saison";
import { cleanPlayerName, isLikelyPlayerName } from "@/lib/players/person-name";
import { simulateRulesOverMatches } from "@/lib/recap/wrapped-simulation";

/**
 * Aggregat für das Saison-Wrapped (W4, Plan 2026-06-12). EIN Objekt mit allen
 * Slide-Daten — der Story-Player und die og-Share-Route rendern daraus.
 */
export interface WrappedStats {
  teamName: string;
  /** Saison-Code des Aggregats, z.B. "2526". */
  saison: string;
  spiele: number;
  siege: number;
  unentschieden: number;
  niederlagen: number;
  toreGeschossen: number;
  toreKassiert: number;
  /** Nur gesetzt, wenn benannte Torschützen-Events existieren (coverage full). */
  besterTorschuetze: { name: string; tore: number } | null;
  /** Zu-Null-Siege — gleiche Semantik wie der clean_sheet-Trigger (Sieg + 0 Gegentore). */
  zuNull: number;
  /** Chronologie-basiert — gleiche Semantik wie der comeback_win-Trigger. */
  comebacks: number;
  heimsiege: number;
  auswaertssiege: number;
  hoechsterSieg: { heimName: string; gastName: string; ergebnis: string } | null;
  /** Pacts der Mannschaft, deren Laufzeit das Saison-Fenster überlappt. */
  pactsCount: number;
  /** Summe der gezählten Beiträge (confirmed + invoiced — „paid" lebt auf Invoice-Ebene). */
  beitraegeSummeCents: number;
  /** Nur wenn pactsCount === 0: „mit 1 € pro Tor wären das X € gewesen". */
  simulationFallbackCents: number | null;
}

/**
 * Beiträge zählen: confirmed + invoiced. Ein eigener „paid"-Status existiert
 * im charge_status-Enum nicht — bezahlte Charges bleiben `invoiced`, „bezahlt"
 * wird auf der Invoice markiert. confirmed+invoiced deckt damit auch alle
 * bezahlten Beiträge ab.
 */
const COUNTED_CHARGE_STATUSES = ["confirmed", "invoiced"] as const;

/** Mindestzahl gespielter Vorsaison-Spiele, ab der das Wrapped gezeigt wird. */
export const WRAPPED_MIN_MATCHES = 3;

/**
 * Aggregiert alle Wrapped-Kennzahlen einer Mannschaft für eine Saison.
 *
 * Saison-Fenster: [1. Juli Startjahr, 1. Juli Folgejahr) aus dem 4-stelligen
 * Code (lib/utils/saison) — die Historie liegt nach dem Saison-Bump auf
 * derselben Team-Row. Heim/Gast wird wie in evaluate-match über
 * `detectTeamSide([team.name, club.name], heimName)` bestimmt.
 *
 * `null` bei unbekanntem Team oder ungültigem Saison-Code.
 */
export async function getWrappedStats(
  teamId: string,
  saison: string
): Promise<WrappedStats | null> {
  const [team] = await db
    .select({ name: teams.name, clubName: clubs.name })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return null;

  const windowFrom = saisonStartDate(saison);
  const next = nextSaisonCode(saison);
  const windowTo = next ? saisonStartDate(next) : null;
  if (!windowFrom || !windowTo) return null;

  const matchRows = await db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.teamId, teamId),
        eq(matches.status, "finished"),
        gte(matches.datum, windowFrom),
        lt(matches.datum, windowTo)
      )
    );
  const withResult = matchRows.filter(
    (m) => m.ergebnisHeim !== null && m.ergebnisGast !== null
  );

  // Tor-Events aller Fenster-Spiele (Torschütze + Comeback-Chronologie).
  const matchIds = withResult.map((m) => m.id);
  const eventRows = matchIds.length
    ? await db
        .select({
          id: matchEvents.id,
          matchId: matchEvents.matchId,
          type: matchEvents.type,
          subtype: matchEvents.subtype,
          minute: matchEvents.minute,
          side: matchEvents.side,
          playerName: matchEvents.playerName,
          playerId: matchEvents.playerId,
          source: matchEvents.source
        })
        .from(matchEvents)
        .where(
          and(inArray(matchEvents.matchId, matchIds), eq(matchEvents.type, "tor"))
        )
    : [];
  const eventsByMatch = new Map<string, typeof eventRows>();
  for (const e of eventRows) {
    const list = eventsByMatch.get(e.matchId) ?? [];
    list.push(e);
    eventsByMatch.set(e.matchId, list);
  }

  const names = [team.name, team.clubName];
  // Comeback-Erkennung: NICHT nachbauen, sondern die echte Trigger-Engine mit
  // einer Probe-Regel fragen — exakt dieselbe Chronologie-Semantik
  // (wasEverBehind + Halbzeit-Sicherheitsnetz) wie in lib/crawler/triggers.ts.
  const comebackProbe = {
    id: "wrapped-probe",
    pledgeId: "wrapped-probe",
    triggerType: "comeback_win" as const,
    triggerParams: {},
    amountCents: 1,
    perMatchCapCents: null
  };

  let siege = 0;
  let unentschieden = 0;
  let niederlagen = 0;
  let toreGeschossen = 0;
  let toreKassiert = 0;
  let zuNull = 0;
  let comebacks = 0;
  let heimsiege = 0;
  let auswaertssiege = 0;
  let hoechster: { heimName: string; gastName: string; ergebnis: string; diff: number; tore: number } | null =
    null;
  const torschuetzen = new Map<string, number>();
  const simMatches: Array<{
    teamSide: "heim" | "gast";
    ergebnisHeim: number;
    ergebnisGast: number;
    datum: Date;
  }> = [];

  for (const m of withResult) {
    const teamSide = detectTeamSide(names, m.heimName);
    const isHeim = teamSide === "heim";
    const gF = isHeim ? m.ergebnisHeim! : m.ergebnisGast!;
    const gA = isHeim ? m.ergebnisGast! : m.ergebnisHeim!;

    toreGeschossen += gF;
    toreKassiert += gA;
    if (gF > gA) {
      siege++;
      if (isHeim) heimsiege++;
      else auswaertssiege++;
      if (gA === 0) zuNull++;
      const diff = gF - gA;
      if (!hoechster || diff > hoechster.diff || (diff === hoechster.diff && gF > hoechster.tore)) {
        hoechster = {
          heimName: m.heimName,
          gastName: m.gastName,
          ergebnis: `${m.ergebnisHeim}:${m.ergebnisGast}`,
          diff,
          tore: gF
        };
      }
    } else if (gF < gA) {
      niederlagen++;
    } else {
      unentschieden++;
    }

    const events = eventsByMatch.get(m.id) ?? [];
    const matchInput: MatchInput = {
      id: m.id,
      teamSide,
      ergebnisHeim: m.ergebnisHeim!,
      ergebnisGast: m.ergebnisGast!,
      halbzeitHeim: m.halbzeitHeim,
      halbzeitGast: m.halbzeitGast,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        subtype: e.subtype,
        minute: e.minute,
        side: e.side,
        playerName: e.playerName,
        playerId: e.playerId,
        source: e.source
      }))
    };
    if (evaluateTriggers(matchInput, [comebackProbe]).length > 0) comebacks++;

    // Torschützen: nur eigene Tore mit echtem Personennamen.
    for (const e of events) {
      if (e.side !== teamSide) continue;
      if (!isLikelyPlayerName(e.playerName)) continue;
      const name = cleanPlayerName(e.playerName!);
      torschuetzen.set(name, (torschuetzen.get(name) ?? 0) + 1);
    }

    simMatches.push({
      teamSide,
      ergebnisHeim: m.ergebnisHeim!,
      ergebnisGast: m.ergebnisGast!,
      datum: m.datum
    });
  }

  let besterTorschuetze: WrappedStats["besterTorschuetze"] = null;
  for (const [name, tore] of torschuetzen) {
    if (!besterTorschuetze || tore > besterTorschuetze.tore) {
      besterTorschuetze = { name, tore };
    }
  }

  // Pacts der Saison: Laufzeit überlappt das Saison-Fenster.
  const [pactRow] = await db
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(pledges)
    .where(
      and(
        eq(pledges.teamId, teamId),
        lt(pledges.startsAt, windowTo),
        gte(pledges.endsAt, windowFrom)
      )
    );
  const pactsCount = pactRow?.n ?? 0;

  // Beiträge der Saison: Spiel-Charges über das Spieldatum im Fenster,
  // Saison-Charges (matchId NULL) über die saison-Spalte. Beide gespeicherten
  // Saison-Formate matchen ("2526" und "2025/26").
  const saisonFull = `20${saison.slice(0, 2)}/${saison.slice(2)}`;
  const [chargeRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...COUNTED_CHARGE_STATUSES]),
        sql`(
          (${charges.matchId} IS NOT NULL AND ${matches.datum} >= ${windowFrom.toISOString()}::timestamptz AND ${matches.datum} < ${windowTo.toISOString()}::timestamptz)
          OR (${charges.matchId} IS NULL AND ${charges.saison} IN (${saison}, ${saisonFull}))
        )`
      )
    );
  const beitraegeSummeCents = chargeRow?.total ?? 0;

  // Simulation-Fallback nur ohne Pacts: „mit 1 € pro Tor wären das X € gewesen".
  // TODO(nach Merge von W3): läuft dann über lib/simulation/pact-simulation.ts
  // (siehe lib/recap/wrapped-simulation.ts).
  const simulationFallbackCents =
    pactsCount === 0
      ? simulateRulesOverMatches(simMatches, [
          { triggerType: "goal_total", amountCents: 100 }
        ]).totalCents
      : null;

  return {
    teamName: team.name,
    saison,
    spiele: withResult.length,
    siege,
    unentschieden,
    niederlagen,
    toreGeschossen,
    toreKassiert,
    besterTorschuetze,
    zuNull,
    comebacks,
    heimsiege,
    auswaertssiege,
    hoechsterSieg: hoechster
      ? { heimName: hoechster.heimName, gastName: hoechster.gastName, ergebnis: hoechster.ergebnis }
      : null,
    pactsCount,
    beitraegeSummeCents,
    simulationFallbackCents
  };
}

/**
 * Wrapped-Stats der VORSAISON einer Mannschaft (Route + og-Bilder).
 * `null` bei unbekanntem Team oder ungültigem Saison-Code.
 */
export async function getWrappedStatsForPrevSeason(
  teamId: string
): Promise<WrappedStats | null> {
  const [t] = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!t) return null;
  const prev = prevSaisonCode(t.saison);
  if (!prev) return null;
  return getWrappedStats(teamId, prev);
}

/**
 * Entry-Point-Gate für die Team-Dashboard-Karte „✨ Euer Saison-Rückblick ist da":
 * sichtbar, solange die Vorsaison >= WRAPPED_MIN_MATCHES gespielte Spiele hat
 * UND die aktuelle Saison noch < 5 gespielte Spiele. `null` = Karte ausblenden.
 */
export async function getWrappedEntryInfo(
  teamId: string
): Promise<{ prevSaison: string } | null> {
  const [t] = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!t) return null;
  const prev = prevSaisonCode(t.saison);
  const currentStart = saisonStartDate(t.saison);
  if (!prev || !currentStart) return null;
  const prevStart = saisonStartDate(prev);
  if (!prevStart) return null;

  const [counts] = await db
    .select({
      current: sql<number>`COUNT(*) FILTER (WHERE ${matches.datum} >= ${currentStart.toISOString()}::timestamptz)::int`,
      prev: sql<number>`COUNT(*) FILTER (
        WHERE ${matches.datum} >= ${prevStart.toISOString()}::timestamptz AND ${matches.datum} < ${currentStart.toISOString()}::timestamptz
          AND ${matches.ergebnisHeim} IS NOT NULL AND ${matches.ergebnisGast} IS NOT NULL
      )::int`
    })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), eq(matches.status, "finished")));

  if ((counts?.prev ?? 0) < WRAPPED_MIN_MATCHES) return null;
  if ((counts?.current ?? 0) >= 5) return null;
  return { prevSaison: prev };
}
