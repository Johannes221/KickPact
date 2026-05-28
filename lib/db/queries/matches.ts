import { and, eq, desc, asc, gte, lte, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, clubs } from "@/lib/db/schema";
import { charges, charges as chargesTable } from "@/lib/db/schema/charges";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { users } from "@/lib/db/schema/auth";
import { TRIGGER_META } from "@/lib/triggers/labels";

export async function getMatchById(matchId: string, clubSlug: string) {
  const [row] = await db
    .select({
      match: matches,
      team: teams,
      club: clubs
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(eq(matches.id, matchId), eq(clubs.slug, clubSlug)))
    .limit(1);
  return row ?? null;
}

export async function listMatchEvents(matchId: string) {
  return db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(matchEvents.minute);
}

/**
 * Liefert ALLE Spiele einer Mannschaft (vergangen + kommend), neueste zuerst.
 *
 * Kein Status-Filter — geplante (`scheduled`) Spiele kommen genauso zurück wie
 * gespielte (`finished`). Die UI im `app/`-Layer baut darauf ihre Filter (Heim/
 * Auswärts, Hin-/Rückrunde, Saison) — diese Query liefert nur die Rohdaten
 * sauber sortiert.
 */
export async function listMatchesForTeam(teamId: string, limit = 20) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.teamId, teamId))
    .orderBy(desc(matches.datum))
    .limit(limit);
}

/** Parse fussball.de "DD.MM.YYYY" (oder 2-stelliges Jahr) in einen UTC-Date. */
function parseDatumDdMmYyyy(s: string): Date {
  const [dd, mm, yy] = s.split(".");
  const yyyy = yy.length === 2 ? "20" + yy : yy;
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00Z`);
}

/**
 * Persistiert ein noch nicht gespieltes Spiel als Stub-Row mit
 * `status = "scheduled"`. Es werden bewusst KEINE Events angelegt, KEIN
 * Ergebnis gesetzt und vom Caller KEIN `match/finished`-Event emittiert — ein
 * geplantes Spiel darf keine Charges erzeugen.
 *
 * Idempotent: existiert die Row schon (per fussballdeSpielId) und ist noch
 * `scheduled`, werden nur Datum/Teamnamen nachgeführt (Spielverlegung). Ist die
 * Row bereits `finished` (oder anders), wird NICHTS angefasst — der finished-
 * Pfad ist autoritativ und soll nicht von einem stale next.games-Eintrag
 * zurückgesetzt werden.
 *
 * @returns `inserted: true` wenn eine neue Row angelegt wurde, sonst `false`.
 */
export async function upsertScheduledMatch(args: {
  teamId: string;
  fussballdeSpielId: string;
  datum: string; // DD.MM.YYYY
  heimName: string;
  gastName: string;
}): Promise<{ matchId: string; inserted: boolean }> {
  const { teamId, fussballdeSpielId, datum, heimName, gastName } = args;
  const parsedDatum = parseDatumDdMmYyyy(datum);

  const [existing] = await db
    .select({ id: matches.id, status: matches.status })
    .from(matches)
    .where(eq(matches.fussballdeSpielId, fussballdeSpielId))
    .limit(1);

  if (existing) {
    // Nur reine scheduled-Rows nachführen — finished/cancelled/etc. nie überschreiben.
    if (existing.status === "scheduled") {
      await db
        .update(matches)
        .set({ datum: parsedDatum, heimName, gastName })
        .where(eq(matches.id, existing.id));
    }
    return { matchId: existing.id, inserted: false };
  }

  const [row] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId,
      datum: parsedDatum,
      heimName,
      gastName,
      status: "scheduled"
      // ergebnis*/halbzeit*/contentHash bleiben NULL — kein Detail-Scrape.
    })
    .returning({ id: matches.id });

  if (!row) throw new Error("upsertScheduledMatch failed");
  return { matchId: row.id, inserted: true };
}

/** Liefert Charges-Summe pro Match für eine Mannschaft (für die Match-Liste). */
export async function getMatchChargesSummaryForTeam(
  teamId: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      matchId: charges.matchId,
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(and(eq(pledges.teamId, teamId), sql`${charges.matchId} IS NOT NULL`))
    .groupBy(charges.matchId);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.matchId) map.set(r.matchId, Number(r.total));
  }
  return map;
}

export interface MatchChargeRow {
  chargeId: string;
  triggerType: string;
  amountCents: number;
  status: string;
  matchEventId: string | null;
  sponsorDisplayName: string;
  pledgeId: string;
}

export interface MatchChargesData {
  rows: MatchChargeRow[];
  totalCents: number;
  /** Pro Trigger-Typ aggregiert */
  byTrigger: Array<{
    triggerType: string;
    label: string;
    emoji: string;
    count: number;
    totalCents: number;
  }>;
  /** Pro Sponsor aggregiert */
  bySponsor: Array<{
    sponsorDisplayName: string;
    totalCents: number;
    triggerSummary: string;
  }>;
}

export async function listMatchCharges(matchId: string): Promise<MatchChargesData> {
  const rows = await db
    .select({
      chargeId: chargesTable.id,
      triggerType: chargesTable.triggerType,
      amountCents: chargesTable.amountCents,
      status: chargesTable.status,
      matchEventId: chargesTable.matchEventId,
      sponsorDisplayName: sponsors.displayName,
      pledgeId: chargesTable.pledgeId
    })
    .from(chargesTable)
    .innerJoin(pledges, eq(chargesTable.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(eq(chargesTable.matchId, matchId))
    .orderBy(chargesTable.triggerType);

  const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);

  // Gruppierung nach Trigger
  const triggerMap = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const existing = triggerMap.get(r.triggerType) ?? { count: 0, total: 0 };
    triggerMap.set(r.triggerType, {
      count: existing.count + 1,
      total: existing.total + r.amountCents
    });
  }
  const byTrigger = [...triggerMap.entries()].map(([tt, v]) => {
    const meta = (TRIGGER_META as Record<string, { label: string; emoji: string } | undefined>)[tt];
    return {
      triggerType: tt,
      label: meta?.label ?? tt,
      emoji: meta?.emoji ?? "💚",
      count: v.count,
      totalCents: v.total
    };
  });

  // Gruppierung nach Sponsor
  const sponsorMap = new Map<string, { total: number; triggers: Set<string> }>();
  for (const r of rows) {
    const existing = sponsorMap.get(r.sponsorDisplayName) ?? { total: 0, triggers: new Set() };
    existing.total += r.amountCents;
    const meta = (TRIGGER_META as Record<string, { label: string; emoji: string } | undefined>)[
      r.triggerType
    ];
    existing.triggers.add(`${meta?.emoji ?? "💚"} ${meta?.label ?? r.triggerType}`);
    sponsorMap.set(r.sponsorDisplayName, existing);
  }
  const bySponsor = [...sponsorMap.entries()].map(([name, v]) => ({
    sponsorDisplayName: name,
    totalCents: v.total,
    triggerSummary: [...v.triggers].join(", ")
  }));

  return { rows, totalCents, byTrigger, bySponsor };
}

// ───────────────────────────────────────────────────────────────────────────────
// Team-Centric Spiele-Liste (Tab 3 — Team-Scope Dashboard, Plan 2026-05-25)
// ───────────────────────────────────────────────────────────────────────────────

export type TeamMatchResult = "win" | "loss" | "draw" | "all";

export interface ListMatchesForTeamFilters {
  /** "2526", "2425" — wenn gesetzt, nur Matches dieser Saison. */
  saison?: string;
  /** Datum >= fromDate */
  fromDate?: Date;
  /** Datum <= toDate */
  toDate?: Date;
  /** Win/Loss/Draw aus Sicht der eigenen Mannschaft */
  result?: TeamMatchResult;
  /** Sortrichtung nach Datum. Default "desc" (neueste zuerst). */
  order?: "asc" | "desc";
  /** Sicherheits-Limit. Default 200. */
  limit?: number;
}

export interface MatchListRow {
  id: string;
  teamId: string;
  saison: string;
  datum: Date;
  heimName: string;
  gastName: string;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  halbzeitHeim: number | null;
  halbzeitGast: number | null;
  status: "scheduled" | "live" | "finished" | "cancelled" | "postponed";
  /** True wenn die eigene Mannschaft im heim-Slot spielt. */
  isHeim: boolean;
  /** Ergebnis aus Sicht der eigenen Mannschaft. NULL bei ausstehenden Spielen. */
  result: "win" | "loss" | "draw" | null;
  eventsCount: number;
  goalsCount: number;
  cardsCount: number;
  chargesSumCents: number;
}

/**
 * Liefert alle Matches einer Mannschaft über alle ihre Saisons. Da `teams` pro
 * Saison eine eigene Row hat, joinen wir über `fussballdeTeamId` (falls vorhanden)
 * oder fallback über `clubId + name`.
 *
 * Filter werden NACH dem Loading angewendet — Result-Filter braucht
 * Heim/Gast-Logik per Row.
 */
export async function listMatchesForTeamFiltered(
  teamId: string,
  filters: ListMatchesForTeamFilters = {}
): Promise<MatchListRow[]> {
  const { saison, fromDate, toDate, result = "all", order = "desc", limit = 200 } = filters;

  // 1) Resolve "Geschwister-Teams" (gleiche Mannschaft über Saisons hinweg)
  const [anchorTeam] = await db
    .select({
      id: teams.id,
      clubId: teams.clubId,
      name: teams.name,
      fussballdeTeamId: teams.fussballdeTeamId
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!anchorTeam) return [];

  const siblingTeams = await db
    .select({ id: teams.id, saison: teams.saison, name: teams.name })
    .from(teams)
    .where(
      and(
        eq(teams.clubId, anchorTeam.clubId),
        anchorTeam.fussballdeTeamId
          ? eq(teams.fussballdeTeamId, anchorTeam.fussballdeTeamId)
          : eq(teams.name, anchorTeam.name)
      )
    );

  if (siblingTeams.length === 0) return [];
  let teamIds = siblingTeams.map((t) => t.id);
  if (saison) {
    teamIds = siblingTeams.filter((t) => t.saison === saison).map((t) => t.id);
    if (teamIds.length === 0) return [];
  }
  const teamSaisonMap = new Map(siblingTeams.map((t) => [t.id, t.saison] as const));

  const teamFirstWord = anchorTeam.name.toLowerCase().split(" ")[0] ?? "";

  // 2) Query matches mit Aggregaten
  const dateConditions: SQL[] = [];
  if (fromDate) dateConditions.push(gte(matches.datum, fromDate));
  if (toDate) dateConditions.push(lte(matches.datum, toDate));

  const rows = await db
    .select({
      id: matches.id,
      teamId: matches.teamId,
      datum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      halbzeitHeim: matches.halbzeitHeim,
      halbzeitGast: matches.halbzeitGast,
      status: matches.status,
      eventsCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM ${matchEvents} me WHERE me.match_id = ${matches.id}
      ), 0)`,
      goalsCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM ${matchEvents} me
        WHERE me.match_id = ${matches.id} AND me.type = 'tor'
      ), 0)`,
      cardsCount: sql<number>`COALESCE((
        SELECT COUNT(*)::int FROM ${matchEvents} me
        WHERE me.match_id = ${matches.id} AND me.type = 'karte'
      ), 0)`,
      chargesSumCents: sql<number>`COALESCE((
        SELECT SUM(c.amount_cents)::int FROM ${chargesTable} c
        WHERE c.match_id = ${matches.id}
          AND c.status IN ('confirmed','invoiced')
      ), 0)`
    })
    .from(matches)
    .where(and(inArray(matches.teamId, teamIds), ...dateConditions))
    .orderBy(order === "asc" ? asc(matches.datum) : desc(matches.datum))
    .limit(limit);

  // 3) Map + result derivation
  const mapped: MatchListRow[] = rows.map((r) => {
    const isHeim = r.heimName.toLowerCase().includes(teamFirstWord);
    let derived: MatchListRow["result"] = null;
    if (r.ergebnisHeim !== null && r.ergebnisGast !== null) {
      const ours = isHeim ? r.ergebnisHeim : r.ergebnisGast;
      const opp = isHeim ? r.ergebnisGast : r.ergebnisHeim;
      derived = ours > opp ? "win" : ours < opp ? "loss" : "draw";
    }
    return {
      id: r.id,
      teamId: r.teamId,
      saison: teamSaisonMap.get(r.teamId) ?? "",
      datum: r.datum,
      heimName: r.heimName,
      gastName: r.gastName,
      ergebnisHeim: r.ergebnisHeim,
      ergebnisGast: r.ergebnisGast,
      halbzeitHeim: r.halbzeitHeim,
      halbzeitGast: r.halbzeitGast,
      status: r.status,
      isHeim,
      result: derived,
      eventsCount: Number(r.eventsCount ?? 0),
      goalsCount: Number(r.goalsCount ?? 0),
      cardsCount: Number(r.cardsCount ?? 0),
      chargesSumCents: Number(r.chargesSumCents ?? 0)
    };
  });

  // 4) Result-Filter (post-hoc, da derived)
  if (result !== "all") {
    return mapped.filter((m) => m.result === result);
  }
  return mapped;
}

/**
 * Alle Saisons (deduped, desc-sortiert) für die ein Team Matches hat. Nutzt
 * den gleichen "Sibling-Teams"-Resolver wie listMatchesForTeamFiltered.
 */
export async function getAvailableSaisonsForTeam(teamId: string): Promise<string[]> {
  const [anchorTeam] = await db
    .select({
      clubId: teams.clubId,
      name: teams.name,
      fussballdeTeamId: teams.fussballdeTeamId
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!anchorTeam) return [];

  const siblings = await db
    .select({ id: teams.id, saison: teams.saison })
    .from(teams)
    .where(
      and(
        eq(teams.clubId, anchorTeam.clubId),
        anchorTeam.fussballdeTeamId
          ? eq(teams.fussballdeTeamId, anchorTeam.fussballdeTeamId)
          : eq(teams.name, anchorTeam.name)
      )
    );

  if (siblings.length === 0) return [];

  // Nur Saisons mit Matches zurückgeben — sonst sind leere Optionen verwirrend
  const teamIds = siblings.map((t) => t.id);
  const teamsWithMatches = await db
    .selectDistinct({ teamId: matches.teamId })
    .from(matches)
    .where(inArray(matches.teamId, teamIds));
  const haveMatches = new Set(teamsWithMatches.map((r) => r.teamId));

  const saisons = new Set<string>();
  for (const s of siblings) {
    if (haveMatches.has(s.id)) saisons.add(s.saison);
  }
  return [...saisons].sort().reverse();
}

/**
 * Lädt ein einzelnes Match samt verlinktem Team + Club. Akzeptiert sowohl die
 * "Anker"-teamId der aktuellen Saison als auch jedes Geschwister-Team (über alle
 * Saisons des Vereins). Returns null wenn das Match nicht zur Team-Familie gehört.
 */
export async function getMatchDetailForTeam(matchId: string, teamId: string) {
  const [anchorTeam] = await db
    .select({
      clubId: teams.clubId,
      name: teams.name,
      fussballdeTeamId: teams.fussballdeTeamId
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!anchorTeam) return null;

  const siblings = await db
    .select({ id: teams.id })
    .from(teams)
    .where(
      and(
        eq(teams.clubId, anchorTeam.clubId),
        anchorTeam.fussballdeTeamId
          ? eq(teams.fussballdeTeamId, anchorTeam.fussballdeTeamId)
          : eq(teams.name, anchorTeam.name)
      )
    );
  const teamIds = siblings.map((t) => t.id);
  if (teamIds.length === 0) return null;

  const [row] = await db
    .select({ match: matches, team: teams, club: clubs })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(eq(matches.id, matchId), inArray(matches.teamId, teamIds)))
    .limit(1);

  return row ?? null;
}
