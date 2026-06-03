import { and, eq, ne, desc, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, clubs, players } from "@/lib/db/schema";
import { isReadableName } from "@/lib/players/readable-name";
import { charges, charges as chargesTable } from "@/lib/db/schema/charges";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { users } from "@/lib/db/schema/auth";
import { sponsorLabelSql } from "./sponsor-label";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { detectTeamSide } from "@/lib/crawler/team-side";
import { saisonStartDate } from "@/lib/utils/saison";

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
  // Auswechslungen ausblenden: keine Wette/kein Trigger hängt an ihnen, sie
  // machen die Ereignis-Liste nur unübersichtlich. Tore (und ggf. Karten/
  // Spezial-Events) bleiben sichtbar.
  return db
    .select()
    .from(matchEvents)
    .where(and(eq(matchEvents.matchId, matchId), ne(matchEvents.type, "auswechslung")))
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
  // Display-Gate: nur Spiele AB Saisonstart der Mannschaft zeigen. Verhindert,
  // dass versehentlich persistierte Alt-Saison-Spiele (vor dem Scraper-Fix
  // 2026-06-01) Dashboard + Spiele-Liste verschmutzen. Robuste „immer nur die
  // aktuelle Saison"-Garantie, unabhängig vom DB-Zustand.
  const [t] = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const fromDate = t ? saisonStartDate(t.saison) : null;

  const conditions = [eq(matches.teamId, teamId)];
  if (fromDate) conditions.push(gte(matches.datum, fromDate));

  return db
    .select()
    .from(matches)
    .where(and(...conditions))
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
      sponsorDisplayName: sponsorLabelSql,
      pledgeId: chargesTable.pledgeId
    })
    .from(chargesTable)
    .innerJoin(pledges, eq(chargesTable.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
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

/**
 * Liefert die eindeutigen Namen aller Spieler, die für eine Mannschaft jemals
 * aufgelaufen sind — aus den gescrapten `match_events` (Tore, Auswechslungen,
 * Karten). Quelle für den Spieler-Picker im Pact-Wizard, ergänzend zum
 * Live-fussball.de-Kader (E2E-Finding 2026-06-01: Kader-Dropdown war leer,
 * obwohl `match_events.player_name` echte Namen enthielt).
 *
 * Pro Spiel wird via `detectTeamSide` die eigene Seite bestimmt und nur Events
 * dieser Seite (mit nicht-leerem Spielernamen) berücksichtigt — Gegner-Spieler
 * tauchen also nicht auf. Alphabetisch sortiert.
 */
export async function getTeamPlayerNames(teamId: string): Promise<string[]> {
  const [team] = await db
    .select({ name: teams.name, clubName: clubs.name })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return [];

  const rows = await db
    .select({
      heimName: matches.heimName,
      side: matchEvents.side,
      playerName: matchEvents.playerName
    })
    .from(matchEvents)
    .innerJoin(matches, eq(matchEvents.matchId, matches.id))
    .where(eq(matches.teamId, teamId));

  const names = new Set<string>();
  for (const r of rows) {
    const name = cleanPlayerName(r.playerName);
    if (!name) continue;
    const ownSide = detectTeamSide([team.name, team.clubName], r.heimName);
    if (r.side === ownSide) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Vollständige, sofort verfügbare Spieler-Auswahlliste für das Sponsor-Dropdown
 * („Tore von Spieler X"). Vereint zwei DB-Quellen — kein Live-Scrape mehr, daher
 * schnell und vorladbar:
 *
 *   1) `players` — der vom Crawl persistierte Kader (auch Spieler, die noch kein
 *      Tor geschossen haben). Blockierte (DSGVO-Opt-out) werden ausgeschlossen.
 *   2) `match_events` — alle Spieler, die je für die Mannschaft aufgelaufen sind
 *      (via {@link getTeamPlayerNames}, eigene Seite, bereinigt).
 *
 * Obfuskierte (Tofu-)Namen werden via {@link isReadableName} gefiltert, das
 * Ergebnis ist dedupliziert und deutsch-alphabetisch sortiert.
 */
export async function getTeamPlayerPool(teamId: string): Promise<string[]> {
  const [rosterRows, eventNames] = await Promise.all([
    db
      .select({ name: players.name })
      .from(players)
      .where(and(eq(players.teamId, teamId), eq(players.blocked, false))),
    getTeamPlayerNames(teamId)
  ]);

  const names = new Set<string>();
  for (const r of rosterRows) {
    const name = (r.name ?? "").trim();
    if (name) names.add(name);
  }
  for (const n of eventNames) names.add(n);

  return [...names]
    .filter(isReadableName)
    .sort((a, b) => a.localeCompare(b, "de"));
}

/**
 * Säubert gescrapte Spielernamen: manche fussball.de-Linktexte hängen den
 * Vereinsnamen + " Spieler" an (z.B. "Max Mustermann (FC Sportfr. Dossenheim)
 * Spieler"). Wir strippen dieses Suffix, damit das Dropdown nur den reinen
 * Namen zeigt (E2E-Finding 2026-06-03).
 */
function cleanPlayerName(raw: string | null): string {
  return (raw ?? "")
    .replace(/\s*\([^)]*\)\s*Spieler\s*$/u, "")
    .replace(/\s+Spieler\s*$/u, "")
    .trim();
}

/**
 * fussball.de-Referenz (Team-ID + Slug) einer Mannschaft — für den Live-Kader-
 * Abruf im Crawler. `undefined`, wenn das Team nicht existiert.
 */
export async function getTeamFussballdeRef(
  teamId: string
): Promise<{ fussballdeTeamId: string | null; fussballdeSlug: string | null } | undefined> {
  const [team] = await db
    .select({
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return team;
}

/** Mannschaft (id/name/saison/fussballdeTeamId) für die Spiele-Seite, club-scoped. */
export async function getTeamForMatchesPage(teamId: string, clubId: string) {
  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      fussballdeTeamId: teams.fussballdeTeamId
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, clubId)))
    .limit(1);
  return team;
}

/** Geschwister-Saisons (gleiche fussballdeTeamId), neueste zuerst — Saison-Umschalter. */
export async function listTeamSiblingSeasons(fussballdeTeamId: string) {
  return db
    .select({ id: teams.id, saison: teams.saison })
    .from(teams)
    .where(eq(teams.fussballdeTeamId, fussballdeTeamId))
    .orderBy(desc(teams.saison));
}
