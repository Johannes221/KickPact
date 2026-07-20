import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, pledges, charges, sponsors, users, teams } from "@/lib/db/schema";
import { CAP_COUNTED_STATUSES } from "./evaluation";
import { sponsorLabelSql } from "./sponsor-label";
import { resolveTeamSide } from "@/lib/crawler/team-side";
import { saisonStartDate, nextSaisonCode } from "@/lib/utils/saison";
import { getStoredStandings } from "./standings";
import { resolveSeasonAggregate } from "@/lib/recap/season-aggregate";

export interface TeamSponsorRow {
  sponsorId: string;
  displayName: string;
  /** Aktive Pacts (pledges.status='active') dieses Sponsors auf der Mannschaft. */
  activePacts: number;
  /** Alle Pacts (jeder Status). */
  totalPacts: number;
  /** Bestätigte/abgerechnete Charges-Summe dieses Sponsors auf der Mannschaft. */
  chargedCents: number;
}

/**
 * Alle Sponsoren EINER Mannschaft (für den Sponsoren-Tab) — inkl. Sponsoren, die
 * zwar einen Pact haben, aber noch keine Charges. Sortiert: aktive Pacts zuerst,
 * dann nach abgerechnetem Betrag.
 */
export async function listSponsorsForTeam(teamId: string): Promise<TeamSponsorRow[]> {
  const rows = await db
    .select({
      sponsorId: sponsors.id,
      displayName: sponsorLabelSql,
      activePacts: sql<number>`count(*) FILTER (WHERE ${pledges.status} = 'active')::int`,
      totalPacts: sql<number>`count(*)::int`,
      chargedCents: sql<number>`COALESCE(SUM((
        SELECT SUM(c.amount_cents) FROM ${charges} c
        WHERE c.pledge_id = ${pledges.id} AND c.status IN ('confirmed','invoiced')
      )), 0)::int`
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(users, eq(sponsors.userId, users.id))
    .where(eq(pledges.teamId, teamId))
    .groupBy(sponsors.id, sponsors.displayName, users.name, users.email)
    .orderBy(
      sql`count(*) FILTER (WHERE ${pledges.status} = 'active') DESC, COALESCE(SUM((
        SELECT SUM(c.amount_cents) FROM ${charges} c
        WHERE c.pledge_id = ${pledges.id} AND c.status IN ('confirmed','invoiced')
      )), 0) DESC`
    );

  return rows.map((r) => ({
    sponsorId: r.sponsorId,
    displayName: r.displayName,
    activePacts: Number(r.activePacts ?? 0),
    totalPacts: Number(r.totalPacts ?? 0),
    chargedCents: Number(r.chargedCents ?? 0)
  }));
}

// ---------------- Season Stats ----------------

/**
 * `charges.saison` liegt in ZWEI gespeicherten Formaten vor ("2526" und
 * "2025/26") — jede Query auf die Spalte muss beide matchen (vgl. wrapped.ts).
 */
function saisonVariants(saison: string): string[] {
  return /^\d{4}$/.test(saison)
    ? [saison, `20${saison.slice(0, 2)}/${saison.slice(2)}`]
    : [saison];
}

/**
 * Σ Saison-Beiträge (Aufstieg/Klassenerhalt/Meister/…) EINER Mannschaft für
 * EINEN Saison-Code — also nur die Beiträge mit `match_id = NULL`.
 *
 * Existiert getrennt von `getTeamSeasonChargeTotalCents`, weil diese Beiträge
 * regelmäßig zu einer ANDEREN Saison gehören als `teams.saison`: der
 * Saison-Rollover bumpt `teams.saison` am 15.7., das Endstand-Formular bedient
 * aber bis zum 1.10. bewusst die Vorsaison (resolveSeasonResultTarget). Ein im
 * August eingetragener 25/26-Endstand erzeugt deshalb Beiträge mit
 * `charges.saison = "2526"`, während das Team schon auf "2627" steht.
 *
 * Sie gehören damit in den Saison-Endstand-Block (der IST mit seiner eigenen
 * Saison beschriftet) — nicht in die Sponsor-€-Kachel, die die laufende Saison
 * ausweist. Sonst stünde Geld der Vorsaison unter dem Label der neuen.
 */
export async function getSeasonGoalChargeTotalCents(
  teamId: string,
  saison: string
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int` })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...CAP_COUNTED_STATUSES]),
        sql`${charges.matchId} IS NULL`,
        inArray(charges.saison, saisonVariants(saison))
      )
    );
  return row?.total ?? 0;
}

/**
 * Σ Sponsor-Beiträge EINER Mannschaft in EINER Saison — die Zahl hinter der
 * „Sponsor-€"-Kachel auf dem Mannschafts-Dashboard.
 *
 * Die Kachel lief vorher über `getMatchChargesSummaryForTeam` und log damit auf
 * drei Achsen gleichzeitig (Befund 2026-07-17):
 *  - Saison-Beiträge (`evaluate-season`, z.B. Klassenerhalt/Aufstieg) haben per
 *    Konstruktion `match_id = NULL` und fielen aus einer match-gebundenen Summe
 *    komplett raus. Sichtbar wird das erst NACH Saisonende — also genau bei den
 *    Vereinen, die Saison-Ziele gebucht haben.
 *  - Ohne Status-Filter zählten `cancelled` (fussball.de-Korrektur) und
 *    `pending_approval` als Geld mit.
 *  - Ohne Saison-Fenster stand eine Lifetime-Zahl neben drei Saison-Kacheln
 *    (Spiele/Bilanz/Tore aus computeTeamSeasonStats).
 *
 * Fensterung deshalb identisch zu computeTeamSeasonStats: Spiel-Beiträge über
 * das Spieldatum im halboffenen Saison-Fenster, Saison-Beiträge über die
 * `charges.saison`-Spalte. Beide gespeicherten Saison-Formate matchen ("2526"
 * und "2025/26") — wie in wrapped.ts.
 *
 * BEWUSST NICHT gefiltert: `competitionType = 'friendly'`. computeTeamSeasonStats
 * schließt Freundschaftsspiele aus der Bilanz aus, diese Summe nicht — für
 * Neu-Beiträge folgenlos (das Gate aus Mig 0069 verhindert sie an beiden
 * Insert-Pfaden), für Altbestand von VOR dem Gate stünde hier Geld neben einer
 * Spielzahl, die das Spiel nicht zählt. Nicht wegfiltern: der Betrag wurde real
 * berechnet und fakturiert, ihn aus der Anzeige zu nehmen wäre die schlechtere
 * Lüge. Wie viele solcher Zeilen es gibt, beantwortet:
 *   select count(*) from charges c join matches m on m.id = c.match_id
 *   where m.competition_type = 'friendly' and c.status in ('confirmed','invoiced');
 */
export async function getTeamSeasonChargeTotalCents(
  teamId: string,
  saison: string
): Promise<number> {
  const from = saisonStartDate(saison);
  const to = saisonStartDate(nextSaisonCode(saison) ?? "");

  // Ungültiger Saison-Code (from/to null) → Spiel-Beiträge bleiben ungefenstert,
  // statt still 0 auszuweisen. Analog computeTeamSeasonStats, das die
  // Datums-Conditions ebenfalls nur bei gültigem Code anhängt.
  const matchWindow = [
    sql`${charges.matchId} IS NOT NULL`,
    from ? gte(matches.datum, from) : undefined,
    to ? lt(matches.datum, to) : undefined
  ].filter(Boolean);

  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int` })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        inArray(charges.status, [...CAP_COUNTED_STATUSES]),
        or(
          and(...matchWindow),
          and(
            sql`${charges.matchId} IS NULL`,
            inArray(charges.saison, saisonVariants(saison))
          )
        )
      )
    );
  return row?.total ?? 0;
}

export interface TeamSeasonStats {
  games: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number;
  /** Tabellenplatz — nur gesetzt, wenn die Liga-Tabelle die Quelle ist. */
  position: number | null;
  teamsInLeague: number | null;
  /** "table" = volle Saison laut Liga-Tabelle, "matches" = nur ausgewertete Spiele. */
  source: "table" | "matches";
}

/** Bilanz/Tore aus abgeschlossenen Matches. Heim/Auswärts robust über
 *  Team- + Vereinsname (vgl. ursprüngliche Inline-Logik der Dashboard-Seite).
 *
 *  Aufs AKTUELLE Saison-Fenster beschränkt (datum >= saisonStartDate der
 *  Team-Row, analog Display-Gate in listMatchesForTeam): der Vorsaison-
 *  Backfill (backfill-team-history) legt finished-Rows mit Ergebnis aus der
 *  Vorsaison auf derselben Team-Row an — ohne Fenster würden Dashboard-Stats
 *  und öffentliches Profil Vorsaison + aktuelle Saison zusammenzählen.
 *
 *  Die Liga-Tabelle geht vor, wenn sie mehr Spiele kennt als wir gescrapt haben
 *  (`resolveSeasonAggregate`): eine mitten in der Saison onboardete Mannschaft
 *  hat sonst nur die ~10 vom Spielplan-Endpunkt gelieferten Spiele in der DB und
 *  zeigte sie — auch öffentlich auf /m/[slug] — als Saison-Bilanz aus.
 *  Rein DB-lesend, kein Scrape im Request-Pfad. */
export async function computeTeamSeasonStats(
  teamId: string, teamName: string, clubName: string
): Promise<TeamSeasonStats> {
  const [t] = await db
    .select({ saison: teams.saison, fussballdeTeamId: teams.fussballdeTeamId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  const fromDate = t ? saisonStartDate(t.saison) : null;
  // Halb-offenes Fenster [Saisonstart, Start der Folgesaison) — wie im Wrapped.
  // Die Obergrenze ist nötig, seit die Zahlen gegen die saison-gekeyte
  // Liga-Tabelle geprüft werden: hinkt `teams.saison` dem Kalender hinterher
  // (Bump-Lücke), zählte die offene Grenze Spiele ZWEIER Saisons gegen eine
  // Tabelle, die nur eine kennt — die Coverage-Prüfung vergliche ungleiche
  // Grundmengen und verwürfe die Tabelle still.
  const toDate = t ? saisonStartDate(nextSaisonCode(t.saison) ?? "") : null;
  const conditions = [eq(matches.teamId, teamId)];
  if (fromDate) conditions.push(gte(matches.datum, fromDate));
  if (toDate) conditions.push(lt(matches.datum, toDate));
  const rows = await db.select().from(matches).where(and(...conditions));
  // Freundschaftsspiele gehören nicht in die Saison-Bilanz: die Liga-Tabelle
  // zählt sie auch nicht, und ohne diesen Filter wären die beiden Grundmengen
  // unvergleichbar (resolveSeasonAggregate hält sie gegeneinander). Live gesehen
  // am 2026-07-17: /m/fg-union-… wies ein 0:0-Testspiel als „1 Spiele · Bilanz
  // 0/1/0" der neuen Saison aus. Pokal zählt mit — echter Wettkampf, zahlt auch.
  // `unknown` (Alt-Bestand) zählt weiter, sonst verschwinden Bestandsspiele.
  const finished = rows.filter(
    (m) =>
      m.status === "finished" &&
      m.ergebnisHeim !== null &&
      m.competitionType !== "friendly"
  );
  const names = [teamName, clubName];
  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  for (const m of finished) {
    const isHeim =
      resolveTeamSide(m, t?.fussballdeTeamId ?? null, names) === "heim";
    const gF = isHeim ? (m.ergebnisHeim ?? 0) : (m.ergebnisGast ?? 0);
    const gA = isHeim ? (m.ergebnisGast ?? 0) : (m.ergebnisHeim ?? 0);
    goalsFor += gF; goalsAgainst += gA;
    if (gF > gA) wins++; else if (gF < gA) losses++; else draws++;
  }

  // Reiner DB-Read: die Tabelle befüllt der Crawl-Job (`standings-<team>`), der
  // Request-Pfad scrapt nicht und feuert auch kein Event — /m/[slug] ist eine
  // öffentliche Fläche und darf pro Render keinen Netzwerk-Hop zahlen.
  const stored = t ? await getStoredStandings(teamId, t.saison) : null;
  const agg = resolveSeasonAggregate(
    {
      spiele: finished.length,
      siege: wins,
      unentschieden: draws,
      niederlagen: losses,
      toreFor: goalsFor,
      toreAgainst: goalsAgainst
    },
    stored?.data ?? null
  );
  return {
    games: agg.spiele,
    wins: agg.siege,
    draws: agg.unentschieden,
    losses: agg.niederlagen,
    goalsFor: agg.toreFor,
    goalsAgainst: agg.toreAgainst,
    position: agg.tabellenplatz,
    teamsInLeague: agg.teamsInLeague,
    source: agg.source
  };
}
