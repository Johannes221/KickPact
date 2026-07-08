import { eq, and, inArray, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  clubs,
  matches,
  matchEvents,
  players
} from "@/lib/db/schema";
import type { SpielDetails, SpielListItem, KaderPlayer } from "@/lib/crawler/fussballde";
import { isReadableName } from "@/lib/players/readable-name";
import {
  isLikelyPlayerName,
  extractSuffixClub,
  suffixClubMatchesOwn
} from "@/lib/players/person-name";
import { resolveTeamSide } from "@/lib/crawler/team-side";
import { isPlausibleLeague } from "@/lib/utils/league";
import {
  type Coverage,
  combineCoverage,
  coverageFloorFromTeamName
} from "@/lib/triggers/coverage";

export interface ActiveTeam {
  id: string;
  name: string;
  clubId: string;
  fussballdeTeamId: string;
  fussballdeSlug: string;
  saison: string;
}

export async function getActiveTeams(): Promise<ActiveTeam[]> {
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      clubId: teams.clubId,
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug,
      saison: teams.saison
    })
    .from(teams)
    .where(eq(teams.isActive, true));
  return rows
    .filter((r) => r.fussballdeTeamId !== null && r.fussballdeSlug !== null)
    .map((r) => ({
      id: r.id,
      name: r.name,
      clubId: r.clubId,
      fussballdeTeamId: r.fussballdeTeamId!,
      fussballdeSlug: r.fussballdeSlug!,
      saison: r.saison
    }));
}

// ---------------------------------------------------------------------------
// Result verification helpers
// ---------------------------------------------------------------------------

export interface StoredMatch {
  id: string;
  fussballdeSpielId: string;
  heimName: string;
  gastName: string;
  datum: Date;
  ergebnisHeim: number;
  ergebnisGast: number;
}

/** Returns the N most recent matches that already have a final score stored. */
export async function getRecentFinishedMatches(
  teamId: string,
  limit = 3
): Promise<StoredMatch[]> {
  const rows = await db
    .select({
      id: matches.id,
      fussballdeSpielId: matches.fussballdeSpielId,
      heimName: matches.heimName,
      gastName: matches.gastName,
      datum: matches.datum,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(matches)
    .where(
      and(
        eq(matches.teamId, teamId),
        isNotNull(matches.ergebnisHeim),
        isNotNull(matches.ergebnisGast)
      )
    )
    .orderBy(desc(matches.datum))
    .limit(limit);
  // isNotNull guarantees non-null at runtime; narrow the type here
  return rows.filter(
    (r): r is StoredMatch =>
      r.ergebnisHeim !== null && r.ergebnisGast !== null
  );
}

/**
 * Markiert den Beginn eines Crawls für ein Team. Setzt crawlCompletedAt auf
 * NULL zurück, damit isTeamCrawling() für die Dauer des Laufs true liefert.
 */
export async function markCrawlStarted(teamId: string): Promise<void> {
  await db
    .update(teams)
    .set({ crawlStartedAt: new Date(), crawlCompletedAt: null })
    .where(eq(teams.id, teamId));
}

/**
 * Markiert das Ende eines Crawls — danach gilt das Team als nicht mehr crawling.
 * Ein erfolgreicher Abschluss räumt einen zuvor gesetzten Fehler.
 */
export async function markCrawlCompleted(teamId: string): Promise<void> {
  await db
    .update(teams)
    .set({ crawlCompletedAt: new Date(), crawlLastError: null, crawlLastErrorAt: null })
    .where(eq(teams.id, teamId));
}

/**
 * Persistiert die beim Crawl erkannte Liga/Spielklasse auf dem Team. Wird vom
 * crawl-matches-Job mit dem aus der `row-competition`-Zeile extrahierten Wert
 * aufgerufen. Ein leerer/`null`-Wert wird ignoriert — eine bereits gesetzte
 * Liga darf NIE durch einen leeren Crawl-Treffer überschrieben werden.
 */
export async function updateTeamLeague(
  teamId: string,
  league: string | null
): Promise<void> {
  const trimmed = league?.trim();
  if (!trimmed) return;
  // Defense-in-depth: niemals implausible Werte (Wochentag/Uhrzeit/ID) als Liga
  // speichern — selbst wenn ein künftiger Parser-Regress sie durchreicht.
  if (!isPlausibleLeague(trimmed)) return;
  await db
    .update(teams)
    .set({ league: trimmed })
    .where(eq(teams.id, teamId));
}

/**
 * Persistiert die erkannte Daten-Coverage auf dem Team. Der übergebene
 * `scrapedSignal` (aus `classifyScrapedMatches`/`detectTeamCoverage`) wird mit
 * dem Namens-Floor (Altersklasse) UND dem bereits gespeicherten Wert kombiniert
 * — es wird also nur nach OBEN korrigiert. So zieht weder ein torarmer Spieltag
 * noch ein vorübergehend leerer Crawl eine Mannschaft fälschlich herunter (z.B.
 * eine Herren-Mannschaft auf `none`). Siehe lib/triggers/coverage.ts.
 */
export async function updateTeamCoverage(
  teamId: string,
  scrapedSignal: Coverage
): Promise<void> {
  const [row] = await db
    .select({ name: teams.name, current: teams.dataCoverage })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row) return;
  const floor = coverageFloorFromTeamName(row.name);
  let next = combineCoverage(floor, scrapedSignal);
  if (row.current) next = combineCoverage(next, row.current);
  if (next === row.current) return; // idempotent — kein unnötiges Update
  await db
    .update(teams)
    .set({ dataCoverage: next })
    .where(eq(teams.id, teamId));
}

/**
 * Liest die Daten-Coverage einer Mannschaft (für das Gating der Wett-Erstellung).
 * `null` = unklassifizierter Bestand → Aufrufer behandelt es wie `full`
 * (Grandfather, siehe coverageAllowsTrigger).
 */
export async function getTeamDataCoverage(
  teamId: string
): Promise<Coverage | null> {
  const [row] = await db
    .select({ dataCoverage: teams.dataCoverage })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return row?.dataCoverage ?? null;
}

/**
 * Hält einen fehlgeschlagenen Team-Crawl fest (für die Operator-Diagnose).
 * Wird vom crawl-matches-Job im per-Team-catch aufgerufen; markCrawlCompleted
 * räumt den Fehler beim nächsten erfolgreichen Lauf.
 */
export async function markCrawlError(teamId: string, message: string): Promise<void> {
  await db
    .update(teams)
    .set({ crawlLastError: message.slice(0, 1000), crawlLastErrorAt: new Date() })
    .where(eq(teams.id, teamId));
}

/** Liest die Crawl-Timestamps für die Status-API (Polling). */
export async function getTeamCrawlState(
  teamId: string
): Promise<{ crawlStartedAt: Date | null; crawlCompletedAt: Date | null } | null> {
  const [row] = await db
    .select({
      crawlStartedAt: teams.crawlStartedAt,
      crawlCompletedAt: teams.crawlCompletedAt
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return row ?? null;
}

/**
 * Anzahl Spiele einer Mannschaft, gedeckelt auf `cap` (für das „Spiele werden
 * geladen"-Polling: sobald Page und API beide den Cap erreichen, sind sie
 * gleich → kein Dauer-Refresh bei mehr als `cap` Spielen).
 */
export async function countTeamMatchesCapped(
  teamId: string,
  cap: number
): Promise<number> {
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(
      db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.teamId, teamId))
        .limit(cap)
        .as("capped")
    );
  return Number(countRow?.n ?? 0);
}

export async function getActiveTeamById(teamId: string): Promise<ActiveTeam | null> {
  const [row] = await db
    .select({
      id: teams.id,
      name: teams.name,
      clubId: teams.clubId,
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug,
      saison: teams.saison,
      isActive: teams.isActive
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!row || !row.isActive || !row.fussballdeTeamId || !row.fussballdeSlug) return null;
  return {
    id: row.id,
    name: row.name,
    clubId: row.clubId,
    fussballdeTeamId: row.fussballdeTeamId,
    fussballdeSlug: row.fussballdeSlug,
    saison: row.saison
  };
}

export async function findMatchByFussballdeId(
  fussballdeSpielId: string
): Promise<{ id: string; contentHash: string | null } | null> {
  const [m] = await db
    .select({ id: matches.id, contentHash: matches.contentHash })
    .from(matches)
    .where(eq(matches.fussballdeSpielId, fussballdeSpielId))
    .limit(1);
  return m ?? null;
}

function parseDateDdMmYyyy(s: string): Date {
  const [dd, mm, yy] = s.split(".");
  // fussball.de liefert manchmal 2-stellige Jahre ("10.05.26" statt "10.05.2026")
  const yyyy = yy.length === 2 ? "20" + yy : yy;
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
}

// ---------------------------------------------------------------------------
// team-id-Backfill für Alt-Matches (vor Migration 0065)
// ---------------------------------------------------------------------------

/**
 * Ein `finished`-Match ohne gespeicherte fussball.de-team-ids (Alt-Bestand vor
 * Mig 0065) inkl. der Namensquellen, die `detectTeamSide`/`matchHasNameCollision`
 * brauchen (Mannschafts- + Vereinsname + eigene team-id).
 */
export interface MatchMissingTeamIds {
  id: string;
  fussballdeSpielId: string;
  teamId: string;
  heimName: string;
  gastName: string;
  teamName: string;
  clubName: string;
  ownFussballdeTeamId: string | null;
}

/**
 * Alle `finished`-Matches mit NULL `heim_team_id` (⇒ auch `gast_team_id` NULL,
 * beide werden gemeinsam gesetzt). Bewusst OHNE Kollisions-Filter in SQL — die
 * Token-Logik (matchHasNameCollision) läuft im Aufrufer. Deterministisch nach
 * Datum sortiert (älteste zuerst), damit ein gecappter Lauf reproduzierbar
 * fortsetzt. `limit` als harte Obergrenze gegen versehentliches Vollladen.
 */
export async function listFinishedMatchesMissingTeamIds(
  limit: number
): Promise<MatchMissingTeamIds[]> {
  return db
    .select({
      id: matches.id,
      fussballdeSpielId: matches.fussballdeSpielId,
      teamId: matches.teamId,
      heimName: matches.heimName,
      gastName: matches.gastName,
      teamName: teams.name,
      clubName: clubs.name,
      ownFussballdeTeamId: teams.fussballdeTeamId
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(eq(matches.status, "finished"), isNull(matches.heimTeamId)))
    .orderBy(matches.datum)
    .limit(limit);
}

/**
 * Setzt die gescrapten team-ids NUR, solange `heim_team_id` noch NULL ist
 * (Idempotenz + Schutz gegen ein paralleles Update durch den regulären Crawl).
 * Gibt zurück, ob die Zeile tatsächlich geschrieben wurde.
 */
export async function setMatchTeamIds(
  matchId: string,
  heimTeamId: string,
  gastTeamId: string
): Promise<boolean> {
  const res = await db
    .update(matches)
    .set({ heimTeamId, gastTeamId })
    .where(and(eq(matches.id, matchId), isNull(matches.heimTeamId)))
    .returning({ id: matches.id });
  return res.length > 0;
}

export async function insertMatchWithEvents(args: {
  teamId: string;
  listItem: SpielListItem;
  details: SpielDetails;
  contentHash?: string;
}): Promise<{ matchId: string; newEventCount: number }> {
  const { teamId, listItem, details, contentHash } = args;

  const [matchRow] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: details.spielId,
      datum: parseDateDdMmYyyy(listItem.datum),
      heimName: details.heim || listItem.heim,
      gastName: details.gast || listItem.gast,
      heimTeamId: details.heimTeamId,
      gastTeamId: details.gastTeamId,
      ergebnisHeim: details.ergebnis.heim,
      ergebnisGast: details.ergebnis.gast,
      halbzeitHeim: details.halbzeit?.heim ?? null,
      halbzeitGast: details.halbzeit?.gast ?? null,
      status: "finished",
      contentHash: contentHash ?? null
    })
    .returning({ id: matches.id });

  if (!matchRow) throw new Error("insertMatch failed");

  const newEventCount = await writeMatchEvents(matchRow.id, teamId, details);
  return { matchId: matchRow.id, newEventCount };
}

/**
 * Re-imports a previously-scraped match after fussball.de data changed.
 *
 * Deletes only the previously **scraped** `match_events` rows (cascade will not
 * touch `charges` because we want the existing-but-cancelled charge audit trail
 * to survive), updates the parent `matches` row with the new score / halftime /
 * contentHash, then re-inserts events from the fresh scrape.
 *
 * SECURITY (C2): the delete is scoped to `source = "scraped"`. Manually
 * reported events (`source = "manual"`) MUST survive a re-scrape — otherwise a
 * re-crawl would permanently destroy approved/charged manual events, silently
 * drop their (still pending) charges, and orphan already-invoiced charges
 * (charges.matchEventId is ON DELETE SET NULL), breaking the dispute trail.
 * `evaluate-match` re-loads ALL events (scraped + surviving manual) and
 * re-evaluates them, so manual charges are restored after the re-crawl.
 *
 * Callers MUST first invoke `invalidateChargesForMatch` so downstream
 * evaluators don't see double-counted events.
 */
export async function updateMatchWithEvents(args: {
  matchId: string;
  teamId: string;
  listItem: SpielListItem;
  details: SpielDetails;
  contentHash: string;
}): Promise<{ matchId: string; newEventCount: number }> {
  const { matchId, teamId, listItem, details, contentHash } = args;

  // Remove only the old *scraped* events; fresh scraped ones get re-inserted
  // below. Manual events are preserved (see C2 note above).
  await db
    .delete(matchEvents)
    .where(and(eq(matchEvents.matchId, matchId), eq(matchEvents.source, "scraped")));

  await db
    .update(matches)
    .set({
      datum: parseDateDdMmYyyy(listItem.datum),
      heimName: details.heim || listItem.heim,
      gastName: details.gast || listItem.gast,
      heimTeamId: details.heimTeamId,
      gastTeamId: details.gastTeamId,
      ergebnisHeim: details.ergebnis.heim,
      ergebnisGast: details.ergebnis.gast,
      halbzeitHeim: details.halbzeit?.heim ?? null,
      halbzeitGast: details.halbzeit?.gast ?? null,
      status: "finished",
      contentHash
    })
    .where(eq(matches.id, matchId));

  const newEventCount = await writeMatchEvents(matchId, teamId, details);
  return { matchId, newEventCount };
}

/**
 * Audit 2026-05-24 Phase 4 / Task 4.7: Player-Anonymisierung bei Opt-out.
 *
 * `players.blocked=true` wird vom Support gesetzt, wenn ein Spieler oder
 * Erziehungsberechtigter per Mail (siehe DSE Abschnitt 5) der Verarbeitung
 * widerspricht. `upsertPlayer` returnt jetzt `{id, anonymized}` — wenn
 * anonymized=true, schreibt `writeMatchEvents` den match_event mit
 * playerName="Anonymisiert" statt dem echten Namen. Player-Row bleibt erhalten
 * (für Cross-Match-Statistiken, aber Name-Update wird ignoriert).
 */
const ANONYMIZED_NAME = "Anonymisiert";

/**
 * Audit 2026-05-24 Phase 5 / Task 5.2: writeMatchEvents batchen.
 *
 * Vorher: pro Event ein upsertPlayer-Roundtrip + ein insert(matchEvents).
 * Für 1 Spiel mit 10 Events → 20 DB-Calls. × 50 Teams × 30 Spielen pro
 * Crawl-Run = ~30 000 Roundtrips.
 *
 * Jetzt: ein Roundtrip pro Phase
 *   1. Alle fussballdePlayerIds sammeln, ein SELECT für existing players
 *   2. EIN INSERT für alle neuen Players (onConflictDoNothing)
 *   3. EIN SELECT für die fertige ID+blocked-Map
 *   4. EIN INSERT für alle matchEvents
 */
async function writeMatchEvents(
  matchId: string,
  teamId: string,
  details: SpielDetails
): Promise<number> {
  // Eigene Mannschafts-Seite in DIESEM Spiel bestimmen — nur eigene Spieler
  // dürfen in den `players`-Kader, NICHT die Gegner-Torschützen (sonst
  // verschmutzen fremde Spieler den Pool, E2E-Finding 2026-06-09).
  const [ctx] = await db
    .select({
      heimName: matches.heimName,
      teamName: teams.name,
      clubName: clubs.name,
      fussballdeTeamId: teams.fussballdeTeamId
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(matches.id, matchId))
    .limit(1);
  // Eigene Seite deterministisch über die fussball.de-team-id (aus `details`,
  // frisch gescrapt) — nur eigene Torschützen dürfen in den Kader. Fallback aufs
  // Namens-Matching, wenn die team-id fehlt.
  const ownSide: "heim" | "gast" = ctx
    ? resolveTeamSide(
        {
          heimTeamId: details.heimTeamId,
          gastTeamId: details.gastTeamId,
          heimName: ctx.heimName
        },
        ctx.fussballdeTeamId,
        [ctx.teamName, ctx.clubName]
      )
    : "heim";
  const isOwn = (s: "heim" | "gast" | "unbekannt") => s === ownSide;
  // Echter, eigener Spielername? (eigene Seite ist via isOwn schon geprüft;
  // hier zusätzlich gegen falsche Seitenzuordnung das "(Fremdverein) Spieler"-
  // Suffix prüfen + Überschriften/Tofu raus.)
  const ownClub = ctx?.clubName ?? "";
  const isOwnPlayer = (name: string | null | undefined): boolean => {
    if (!isLikelyPlayerName(name)) return false;
    const suffix = extractSuffixClub(name);
    if (suffix && ownClub && !suffixClubMatchesOwn(suffix, ownClub)) return false;
    return true;
  };

  // 1. Sammle (spielerId, name)-Paare NUR der eigenen Seite + nur echte Namen.
  const playerInputs = new Map<string, string>(); // spielerId → name
  for (const ev of details.events) {
    if (!isOwn(ev.side)) continue;
    if (ev.typ === "TOR" && ev.spielerId) {
      if (isOwnPlayer(ev.spielerName)) {
        playerInputs.set(ev.spielerId, ev.spielerName ?? ev.spielerId);
      }
    } else if (ev.typ === "AUSWECHSLUNG" && ev.rein && ev.raus) {
      if (ev.rein.id && isOwnPlayer(ev.rein.name)) {
        playerInputs.set(ev.rein.id, ev.rein.name);
      }
      if (ev.raus.id && isOwnPlayer(ev.raus.name)) {
        playerInputs.set(ev.raus.id, ev.raus.name);
      }
    }
  }

  // 2. Batch-Upsert aller Spieler (ein Insert mit onConflictDoNothing)
  const playerMap = new Map<string, { id: string; blocked: boolean }>();
  if (playerInputs.size > 0) {
    const fussballdeIds = [...playerInputs.keys()];

    await db
      .insert(players)
      .values(
        [...playerInputs.entries()].map(([fbId, name]) => ({
          teamId,
          fussballdePlayerId: fbId,
          name
        }))
      )
      .onConflictDoNothing();

    const rows = await db
      .select({
        id: players.id,
        fussballdePlayerId: players.fussballdePlayerId,
        blocked: players.blocked
      })
      .from(players)
      .where(
        and(eq(players.teamId, teamId), inArray(players.fussballdePlayerId, fussballdeIds))
      );
    for (const r of rows) {
      if (r.fussballdePlayerId) {
        playerMap.set(r.fussballdePlayerId, { id: r.id, blocked: r.blocked });
      }
    }
  }

  // 3. Baue alle matchEvents-Inserts in einem Array.
  // minute nullable: matches.minute ist `integer("minute")` ohne notNull —
  // bei einigen fussball.de-Events fehlt die Minute komplett.
  const eventRows: Array<{
    matchId: string;
    minute: number | null;
    type: "tor" | "auswechslung";
    subtype: string | null;
    side: "heim" | "gast";
    playerName: string | null;
    playerId: string | undefined;
    source: "scraped";
  }> = [];

  for (const ev of details.events) {
    const side: "heim" | "gast" = ev.side === "unbekannt" ? "heim" : ev.side;
    if (ev.typ === "TOR" && ev.spielerId) {
      const player = playerMap.get(ev.spielerId);
      eventRows.push({
        matchId,
        minute: ev.minute,
        type: "tor",
        subtype: null,
        side,
        playerName: player?.blocked ? ANONYMIZED_NAME : ev.spielerName ?? null,
        playerId: player?.id ?? undefined,
        source: "scraped"
      });
    } else if (ev.typ === "AUSWECHSLUNG" && ev.rein && ev.raus) {
      const rein = ev.rein.id ? playerMap.get(ev.rein.id) : undefined;
      const raus = ev.raus.id ? playerMap.get(ev.raus.id) : undefined;
      eventRows.push({
        matchId,
        minute: ev.minute,
        type: "auswechslung",
        subtype: "ein",
        side,
        playerName: rein?.blocked ? ANONYMIZED_NAME : ev.rein.name,
        playerId: rein?.id ?? undefined,
        source: "scraped"
      });
      eventRows.push({
        matchId,
        minute: ev.minute,
        type: "auswechslung",
        subtype: "aus",
        side,
        playerName: raus?.blocked ? ANONYMIZED_NAME : ev.raus.name,
        playerId: raus?.id ?? undefined,
        source: "scraped"
      });
    }
  }

  // 4. EIN INSERT für alle Events
  if (eventRows.length > 0) {
    await db.insert(matchEvents).values(eventRows);
  }

  return eventRows.length;
}

/**
 * Persistiert den fussball.de-Kader eines Teams in `players`. Idempotent:
 * mehrfaches Crawlen erzeugt keine Duplikate.
 *
 * Warum überhaupt? Ohne diesen Schritt entstehen `players` erst aus den
 * Match-Events des ersten gecrawlten Spiels. Direkt nach dem Onboarding ist
 * der Kader dann leer → "Tor von Spieler X"-Pacts (goal_by_player) lassen sich
 * nicht einrichten. Dieser Schritt füllt den Kader beim (Onboarding-)Crawl.
 *
 * Dedup-Strategie (der Unique-Index `players_team_fussballde_idx` greift nur,
 * wenn `fussballde_player_id` NOT NULL ist):
 *  - Spieler MIT spielerId + LESBAREM Namen → Upsert, der einen vorhandenen
 *    Tofu-Namen durch den lesbaren ersetzt (DSGVO-`blocked`-Zeilen bleiben
 *    unangetastet, gleiche Namen werden nicht unnötig geschrieben).
 *  - Spieler MIT spielerId, aber noch UNLESBAREM Namen → nur Insert
 *    (onConflictDoNothing), damit ein bereits aufgelöster Name nicht durch
 *    frischen Tofu überschrieben wird.
 *  - Spieler OHNE spielerId → per Name gegen bestehende Zeilen deduplizieren.
 */
/**
 * Anzahl Roster-Spieler MIT fussball.de-ID für ein Team. Guard im Crawl: der
 * Kader-Scrape (getKader) löst bei VERÖFFENTLICHTEN Kadern bis ~50 Spieler-
 * profil-Seiten auf — das jeden Crawl-Lauf zu wiederholen wäre teuer + Ban-
 * Risiko. Ist der Roster aus einem früheren Squad-Scrape befüllt, überspringen
 * wir; neue Spieler kommen inkrementell über Torschützen (writeMatchEvents) dazu.
 */
export async function countRosterPlayersWithId(teamId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(players)
    .where(
      and(eq(players.teamId, teamId), isNotNull(players.fussballdePlayerId))
    );
  return row?.n ?? 0;
}

export async function persistKader(
  teamId: string,
  kader: KaderPlayer[]
): Promise<number> {
  let inserted = 0;

  const withId = kader.filter((p) => p.spielerId && p.name.trim().length > 0);
  // In-Batch nach spielerId deduplizieren — onConflictDoUpdate darf dieselbe
  // Zielzeile nicht zweimal treffen (Postgres-Fehler).
  const byId = new Map<string, KaderPlayer>();
  for (const p of withId) byId.set(p.spielerId!, p);
  const uniqueWithId = [...byId.values()];

  const readable = uniqueWithId.filter((p) => isReadableName(p.name));
  const unreadable = uniqueWithId.filter((p) => !isReadableName(p.name));

  if (readable.length > 0) {
    await db
      .insert(players)
      .values(
        readable.map((p) => ({
          teamId,
          fussballdePlayerId: p.spielerId!,
          name: p.name
        }))
      )
      .onConflictDoUpdate({
        target: [players.teamId, players.fussballdePlayerId],
        targetWhere: sql`${players.fussballdePlayerId} IS NOT NULL`,
        set: { name: sql`excluded.name` },
        // Nie über blockierte (anonymisierte) Spieler schreiben, und nur wenn
        // sich der Name tatsächlich ändert.
        setWhere: sql`${players.blocked} = false AND ${players.name} <> excluded.name`
      });
    inserted += readable.length;
  }

  if (unreadable.length > 0) {
    await db
      .insert(players)
      .values(
        unreadable.map((p) => ({
          teamId,
          fussballdePlayerId: p.spielerId!,
          name: p.name
        }))
      )
      .onConflictDoNothing();
    inserted += unreadable.length;
  }

  // OHNE spielerId: hier rutschten bisher Match-Überschriften / Fremd-Einträge
  // rein (kein Unique-Index greift). Nur plausible Personennamen zulassen.
  const withoutId = kader.filter(
    (p) => !p.spielerId && p.name.trim().length > 0 && isLikelyPlayerName(p.name)
  );
  if (withoutId.length > 0) {
    const names = [...new Set(withoutId.map((p) => p.name))];
    const existing = await db
      .select({ name: players.name })
      .from(players)
      .where(and(eq(players.teamId, teamId), inArray(players.name, names)));
    const existingNames = new Set(existing.map((r) => r.name));
    const toInsert = names.filter((n) => !existingNames.has(n));
    if (toInsert.length > 0) {
      await db.insert(players).values(toInsert.map((name) => ({ teamId, name })));
      inserted += toInsert.length;
    }
  }

  return inserted;
}
