import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams, clubs } from "@/lib/db/schema/clubs";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { charges } from "@/lib/db/schema/charges";
import { pledges } from "@/lib/db/schema/pledges";
import { resolveTeamSide } from "@/lib/crawler/team-side";
import { evaluateTriggers, type MatchInput } from "@/lib/crawler/triggers";
import { saisonStartDate, nextSaisonCode, prevSaisonCode } from "@/lib/utils/saison";
import { cleanPlayerName, isLikelyPlayerName } from "@/lib/players/person-name";
import { resolveSeasonAggregate } from "@/lib/recap/season-aggregate";
// NUR der Typ (type-only → zur Laufzeit gelöscht): so zieht wrapped.ts NICHT den
// Chromium-Import aus fussballde.ts mit in seine (DB-/RSC-)Bundles.
import type { LeagueStandings } from "@/lib/crawler/fussballde";

/** Schlanke Namens-Normalisierung für den Top-3-Gegner-Abgleich (kein Crawler-Import). */
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[​-‍﻿]/g, "")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

  // ─── Volle-Saison-Aggregate aus der Liga-Tabelle (verifiziert, keine
  //     Projektion). null, wenn keine Tabelle verfügbar war. ───
  /** Tabellenplatz am Saison-Ende. */
  tabellenplatz: number | null;
  /** Anzahl Teams in der Staffel. */
  teamsInLeague: number | null;
  /** Punkte am Saison-Ende. */
  punkte: number | null;
  /** Quelle der großen Aggregate (Tore/Siege/Bilanz): "table" = volle Saison
   *  verifiziert, "matches" = nur die ausgewerteten Spiele (Tabelle geblockt). */
  aggregateSource: "table" | "matches";
  /** Auf wie vielen TATSÄCHLICH ausgewerteten Spielen die Event-Stats
   *  (Torschütze, zu Null, Comebacks, höchster Sieg) beruhen. Kann < spiele sein,
   *  wenn die Tabelle mehr Spiele kennt, als wir im Detail gescrapet haben. */
  detailMatchCount: number;
  /** Bilanz gegen die Top-3 der Tabelle — NUR aus den ausgewerteten Spielen.
   *  null, wenn keine Tabelle. */
  vsTop3: {
    spiele: number;
    siege: number;
    unentschieden: number;
    niederlagen: number;
  } | null;
  /** Bester eigener Spieler in der LIGA-Torschützenliste (Staffel-weit,
   *  verifiziert). null, wenn kein eigener Spieler gelistet / keine Liste. */
  ligaTorschuetze: {
    name: string;
    tore: number;
    /** Platz in der Liga-Torschützenliste (1 = Toptorschütze der Liga). */
    ligaPlatz: number;
  } | null;
  /** Fairness-Platz der Mannschaft (Staffel-weit, volle Saison). null ohne Daten. */
  fairness: {
    platz: number;
    teamsInLeague: number;
    gelb: number;
    rot: number;
    quote: number;
  } | null;
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
  saison: string,
  standings: LeagueStandings | null = null
): Promise<WrappedStats | null> {
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
  // Freundschaftsspiele/Turniere fliegen raus: ein Testspiel ist kein
  // Saison-Ereignis und würde sonst nicht nur die Bilanz verfälschen, sondern
  // auch als "Zu Null", "Comeback" oder Tor des besten Torschützen ins Wrapped
  // wandern. Die Liga-Tabelle, gegen die `resolveSeasonAggregate` hält, kennt
  // sie ebenfalls nicht — mitzählen machte die Grundmengen unvergleichbar.
  // Pokal bleibt drin (echter Wettkampf, zahlt auch); `unknown` (Alt-Bestand)
  // ebenso, sonst verschwinden Bestandsspiele aus dem Rückblick.
  const withResult = matchRows.filter(
    (m) =>
      m.ergebnisHeim !== null &&
      m.ergebnisGast !== null &&
      m.competitionType !== "friendly"
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
    amountCents: 1
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
  // Pro Spiel Gegner + Ausgang — Basis für die „gegen Top-3"-Bilanz (nur aus
  // den tatsächlich ausgewerteten Spielen, verifizierbar).
  const perMatch: Array<{ opponent: string; outcome: "win" | "draw" | "loss" }> = [];

  for (const m of withResult) {
    const teamSide = resolveTeamSide(m, team.fussballdeTeamId, names);
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

    perMatch.push({
      opponent: isHeim ? m.gastName : m.heimName,
      outcome: gF > gA ? "win" : gF < gA ? "loss" : "draw"
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

  // ─── Konsolidierung: große Aggregate (Tore/Siege/Bilanz/Platz) aus der LIGA-
  //     TABELLE übernehmen, wenn verfügbar — das ist die volle, verifizierte
  //     Saison (sonst nur die ~10 live gescrapten Spiele). Event-Stats
  //     (Torschütze, zu Null, Comebacks, höchster Sieg) bleiben aus den
  //     tatsächlich ausgewerteten Spielen — `detailMatchCount` macht die Basis
  //     transparent. KEINE Projektion: jede Zahl ist entweder Tabelle (echt) oder
  //     ausgewertete Spiele (echt). ───
  const detailMatchCount = withResult.length;
  const agg = resolveSeasonAggregate(
    {
      spiele: withResult.length,
      siege,
      unentschieden,
      niederlagen,
      toreFor: toreGeschossen,
      toreAgainst: toreKassiert
    },
    standings
  );
  const aggSpiele = agg.spiele;
  const aggSiege = agg.siege;
  const aggUnent = agg.unentschieden;
  const aggNiederl = agg.niederlagen;
  const aggToreF = agg.toreFor;
  const aggToreA = agg.toreAgainst;
  const { tabellenplatz, teamsInLeague, punkte, source: aggregateSource } = agg;
  let vsTop3: WrappedStats["vsTop3"] = null;

  const own = aggregateSource === "table" ? standings?.ownRow ?? null : null;
  if (own && standings) {
    // Bilanz gegen Top-3 — NUR aus den ausgewerteten Spielen (verifizierbar).
    const top3 = standings.rows
      .filter((r) => r.position <= 3)
      .map((r) => normName(r.teamName));
    const isTop3 = (opp: string) => {
      const o = normName(opp);
      return top3.some((t) => t.length > 3 && (o.includes(t) || t.includes(o)));
    };
    const vt = { spiele: 0, siege: 0, unentschieden: 0, niederlagen: 0 };
    for (const pm of perMatch) {
      if (!isTop3(pm.opponent)) continue;
      vt.spiele++;
      if (pm.outcome === "win") vt.siege++;
      else if (pm.outcome === "draw") vt.unentschieden++;
      else vt.niederlagen++;
    }
    vsTop3 = vt;
  }

  // Liga-Torschütze + Fairness (Staffel-weit, verifiziert) — best-effort aus
  // den Standings-Extras. Der beste eigene Spieler der Liga-Torschützenliste.
  //
  // An `own` gekoppelt (wie vsTop3): beide sind Aussagen ÜBER DIE STAFFEL. Haben
  // wir die Tabelle als nicht saisondeckend verworfen (Jugend-Vorrunde: 8 Spiele
  // in der Staffel, 22 gespielt), wäre ein Fairness- oder Torjägerplatz aus
  // genau dieser Staffel ein Saison-Anspruch, den wir gerade zurückgewiesen
  // haben — und stünde neben „22 ausgewertete Spiele". Lieber Slide weglassen.
  let ligaTorschuetze: WrappedStats["ligaTorschuetze"] = null;
  const ownScorer = own ? standings?.ownTopScorers?.[0] : undefined;
  if (ownScorer && ownScorer.tore > 0) {
    ligaTorschuetze = {
      name: ownScorer.name,
      tore: ownScorer.tore,
      ligaPlatz: ownScorer.position
    };
  }

  let fairness: WrappedStats["fairness"] = null;
  const fr = own ? standings?.fairnessOwnRow ?? null : null;
  if (fr && standings?.fairnessTeamsInLeague) {
    fairness = {
      platz: fr.position,
      teamsInLeague: standings.fairnessTeamsInLeague,
      gelb: fr.gelb,
      rot: fr.rot + fr.gelbRot,
      quote: fr.quote
    };
  }

  // Simulation-Fallback nur ohne Pacts: „mit 1 € pro Tor wären das X € gewesen".
  // Auf den ECHTEN Toren (Tabelle, wenn vorhanden) → exakt, keine Hochrechnung.
  const simulationFallbackCents = pactsCount === 0 ? aggToreF * 100 : null;

  return {
    teamName: team.name,
    saison,
    spiele: aggSpiele,
    siege: aggSiege,
    unentschieden: aggUnent,
    niederlagen: aggNiederl,
    toreGeschossen: aggToreF,
    toreKassiert: aggToreA,
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
    simulationFallbackCents,
    tabellenplatz,
    teamsInLeague,
    punkte,
    aggregateSource,
    detailMatchCount,
    vsTop3,
    ligaTorschuetze,
    fairness
  };
}

/**
 * Wrapped-Stats der VORSAISON einer Mannschaft (Route + og-Bilder).
 * `null` bei unbekanntem Team oder ungültigem Saison-Code.
 */
export async function getWrappedStatsForPrevSeason(
  teamId: string,
  standings: LeagueStandings | null = null
): Promise<WrappedStats | null> {
  const [t] = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!t) return null;
  const prev = prevSaisonCode(t.saison);
  if (!prev) return null;
  return getWrappedStats(teamId, prev, standings);
}

/** Vorsaison-Code einer Mannschaft (pure, kein Crawler-Import) — damit Caller
 *  vor getWrappedStatsForPrevSeason die passende Tabelle (getCachedStandings)
 *  holen können. `null` bei unbekanntem Team. */
export async function getPrevSaisonForTeam(
  teamId: string
): Promise<string | null> {
  const [t] = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return t ? prevSaisonCode(t.saison) : null;
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
