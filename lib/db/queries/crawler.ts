import { eq, and, inArray, isNotNull, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  teams,
  matches,
  matchEvents,
  players
} from "@/lib/db/schema";
import type { SpielDetails, SpielListItem, KaderPlayer } from "@/lib/crawler/fussballde";

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
 * Deletes the old `match_events` rows (cascade will not touch `charges`
 * because we want the existing-but-cancelled charge audit trail to survive),
 * updates the parent `matches` row with the new score / halftime / contentHash,
 * then re-inserts events from the fresh scrape.
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

  // Remove old events; new ones get re-inserted below.
  await db.delete(matchEvents).where(eq(matchEvents.matchId, matchId));

  await db
    .update(matches)
    .set({
      datum: parseDateDdMmYyyy(listItem.datum),
      heimName: details.heim || listItem.heim,
      gastName: details.gast || listItem.gast,
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
  // 1. Sammle alle (spielerId, name)-Paare aus den Events
  const playerInputs = new Map<string, string>(); // spielerId → name
  for (const ev of details.events) {
    if (ev.typ === "TOR" && ev.spielerId) {
      playerInputs.set(ev.spielerId, ev.spielerName ?? ev.spielerId);
    } else if (ev.typ === "AUSWECHSLUNG" && ev.rein && ev.raus) {
      if (ev.rein.id) playerInputs.set(ev.rein.id, ev.rein.name);
      if (ev.raus.id) playerInputs.set(ev.raus.id, ev.raus.name);
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
 *  - Spieler MIT spielerId → Batch-INSERT onConflictDoNothing.
 *  - Spieler OHNE spielerId → per Name gegen bestehende Zeilen deduplizieren.
 * Bestehende Zeilen werden NICHT überschrieben (respektiert DSGVO-`blocked`).
 */
export async function persistKader(
  teamId: string,
  kader: KaderPlayer[]
): Promise<number> {
  let inserted = 0;

  const withId = kader.filter((p) => p.spielerId && p.name.trim().length > 0);
  if (withId.length > 0) {
    await db
      .insert(players)
      .values(
        withId.map((p) => ({
          teamId,
          fussballdePlayerId: p.spielerId!,
          name: p.name
        }))
      )
      .onConflictDoNothing();
    inserted += withId.length;
  }

  const withoutId = kader.filter((p) => !p.spielerId && p.name.trim().length > 0);
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
