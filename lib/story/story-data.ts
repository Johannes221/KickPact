import { readDocumentBytes } from "@/lib/storage/documents";
import { getCachedStandingsForRequest } from "@/lib/recap/standings-cache";
import type { LeagueStandings } from "@/lib/crawler/fussballde";
import {
  getStoryTeam,
  getStoryMatch,
  getMatchScorers,
  getOpponentLogoUrl,
  type StoryMatch,
  type StoryScorer
} from "@/lib/db/queries/story";
import { formatDate } from "@/lib/utils/date-format";
import {
  pickCrest,
  recapHeadline,
  kickoffLabel,
  type StoryCrest,
  type RecapHeadline
} from "@/lib/story/story-content";

/**
 * Daten-Assembly für die Story-Vorlagen (Aufgabe #44): DB + Storage + Liga-
 * Tabelle → ein fertiges Modell, das die Bild-Route nur noch zeichnet.
 *
 * Leitplanke: NICHTS erfinden. Jedes Feld ist entweder real vorhanden oder
 * `null`, und die Vorlage muss ohne es gut aussehen — bei Amateurvereinen ist
 * „Tabelle noch leer, keine Torschützen, kein Logo" der NORMALFALL, nicht der
 * Fehlerfall.
 */

/* ------------------------------ Wappen-Bytes ------------------------------ */

/**
 * Satori (next/og) rastert nur PNG/JPEG zuverlässig — WebP kann es nicht, und
 * einen Konverter (sharp) gibt es im Stack nicht. Format über Magic Bytes
 * bestimmen statt über die Datei-Endung: die Endung ist bloß der Storage-Key,
 * die Bytes sind die Wahrheit.
 */
function imageMime(bytes: Buffer): "image/png" | "image/jpeg" | null {
  if (bytes.length > 8 && bytes.subarray(0, 4).toString("hex") === "89504e47") {
    return "image/png";
  }
  if (bytes.length > 3 && bytes.subarray(0, 3).toString("hex") === "ffd8ff") {
    return "image/jpeg";
  }
  return null;
}

/**
 * Logo als data-URI laden. `null` bei fehlendem/unlesbarem/nicht einbettbarem
 * Bild (z.B. WebP) — der Aufrufer fällt dann auf das Kürzel zurück, statt ein
 * kaputtes Motiv zu teilen.
 */
async function logoDataUrl(storageUrl: string | null): Promise<string | null> {
  if (!storageUrl) return null;
  const bytes = await readDocumentBytes(storageUrl);
  if (!bytes) return null;
  const mime = imageMime(bytes);
  if (!mime) return null;
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/* ------------------------------- Tabelle ---------------------------------- */

/** Namens-Normalisierung fürs Tabellen-Matching (nur Buchstaben/Ziffern). */
function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9äöüß]/g, "");
}

/**
 * Tabellenplatz einer Seite. Gematcht wird über den exakt normalisierten Namen
 * — bewusst KEIN unscharfes Enthalten-Matching: „SV X II" und „SV X III" wären
 * sonst verwechselbar, und ein falscher Tabellenplatz auf einer geteilten Story
 * ist schlimmer als gar keiner. Kein Treffer (Pokalspiel, Tabelle noch leer,
 * abweichende Schreibweise) → null → die Vorlage lässt das Feld weg.
 */
function positionOf(
  standings: LeagueStandings | null,
  name: string
): number | null {
  if (!standings?.rows?.length) return null;
  const target = normalizeTeamName(name);
  const hits = standings.rows.filter((r) => normalizeTeamName(r.teamName) === target);
  return hits.length === 1 ? hits[0].position : null;
}

/* -------------------------------- Modell ---------------------------------- */

export interface StorySide {
  name: string;
  crest: StoryCrest;
  /** Tabellenplatz — null, wenn die Liga-Tabelle (noch) nichts hergibt. */
  position: number | null;
}

interface StoryBase {
  matchId: string;
  teamName: string;
  /** Liga der eigenen Mannschaft (teams.league) — null vor dem ersten Crawl. */
  league: string | null;
  heim: StorySide;
  gast: StorySide;
  ownSide: "heim" | "gast";
  /** Anzahl Teams in der Liga — für „Platz 3 von 14". */
  teamsInLeague: number | null;
}

export interface PreviewStory extends StoryBase {
  kind: "vorschau";
  /** „Heute" / „Morgen" / „Samstag" / „Sa., 01.08." */
  kickoff: string;
  /** Volles Datum „Sa., 18.07.2026" als Zweitzeile. */
  dateLine: string;
}

/**
 * KEINE Anstoßzeit — bewusst.
 *
 * `matches.datum` ist ein reiner DATUMS-Platzhalter: `parseDatumDdMmYyyy`
 * (lib/db/queries/matches.ts) setzt hart `T12:00:00Z`, der Crawler liest die
 * Uhrzeit von fussball.de nie aus. Eine Zeit auf der Story wäre frei erfunden
 * (je nach Zeitzone „13:00"/„14:00") — und zwar öffentlich auf Instagram, wo
 * jeder Verein sofort sieht, dass sie falsch ist. Erst wenn der Scraper eine
 * echte Anstoßzeit persistiert, gehört sie hier rein.
 */

export interface RecapStory extends StoryBase {
  kind: "rueckblick";
  ergebnisHeim: number;
  ergebnisGast: number;
  headline: RecapHeadline;
  /** Torschützen der EIGENEN Seite — oft leer (fussball.de-Coverage). */
  scorers: StoryScorer[];
  dateLine: string;
}

export type StoryModel = PreviewStory | RecapStory;

/**
 * Ist das Spiel gelaufen und gewertet? Nur dann gibt es einen Rückblick.
 *
 * TODO(#43): Aufgabe #43 legt `lib/matches/display-state.ts` mit `hasResult` /
 * `isUpcomingMatch` an. Sobald die auf main ist, diese lokale Variante durch den
 * gemeinsamen Helfer ersetzen — es darf nur EINE Definition von „gespielt" geben.
 * Hier noch lokal, weil das Modul im Worktree dieses Branches nicht existiert.
 */
function isPlayed(m: StoryMatch): boolean {
  return m.status === "finished" && m.ergebnisHeim !== null && m.ergebnisGast !== null;
}

/**
 * Baut das Story-Modell für ein Spiel der Mannschaft. Wählt die Vorlage selbst:
 * gewertetes Spiel → Rückblick, sonst → Vorschau.
 *
 * `null`, wenn Mannschaft/Spiel nicht existieren oder das Spiel nicht zu dieser
 * Mannschaft gehört (der Tenant-Filter sitzt in getStoryMatch).
 */
export async function buildStoryModel(
  teamId: string,
  matchId: string,
  now: Date = new Date()
): Promise<StoryModel | null> {
  const team = await getStoryTeam(teamId);
  if (!team) return null;
  const match = await getStoryMatch(teamId, matchId);
  if (!match) return null;

  const ownIsHeim = match.ownSide === "heim";
  const opponentFussballdeTeamId = ownIsHeim ? match.gastTeamId : match.heimTeamId;

  // Tabelle nie synchron scrapen (Request-Pfad) — bei Miss kommt null zurück
  // und der Prewarm-Job füllt für den nächsten Aufruf nach.
  const [ownLogo, opponentLogo, standings] = await Promise.all([
    logoDataUrl(team.logoUrl),
    getOpponentLogoUrl(opponentFussballdeTeamId).then(logoDataUrl),
    getCachedStandingsForRequest(teamId, team.saison).catch(() => null)
  ]);

  const ownCrest = pickCrest({
    name: ownIsHeim ? match.heimName : match.gastName,
    uploadedLogo: ownLogo,
    // fussball.de liefert (noch) keine Wappen — siehe pickCrest-Doc.
    fussballdeLogo: null
  });
  const opponentCrest = pickCrest({
    name: ownIsHeim ? match.gastName : match.heimName,
    uploadedLogo: opponentLogo,
    fussballdeLogo: null
  });

  const heim: StorySide = {
    name: match.heimName,
    crest: ownIsHeim ? ownCrest : opponentCrest,
    position: positionOf(standings, match.heimName)
  };
  const gast: StorySide = {
    name: match.gastName,
    crest: ownIsHeim ? opponentCrest : ownCrest,
    position: positionOf(standings, match.gastName)
  };

  const base: StoryBase = {
    matchId: match.id,
    teamName: team.name,
    league: team.league,
    heim,
    gast,
    ownSide: match.ownSide,
    teamsInLeague: standings?.teamsInLeague ?? null
  };

  const dateLine = formatDate(match.datum, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  if (isPlayed(match)) {
    return {
      ...base,
      kind: "rueckblick",
      ergebnisHeim: match.ergebnisHeim!,
      ergebnisGast: match.ergebnisGast!,
      headline: recapHeadline(match.ownSide, match.ergebnisHeim!, match.ergebnisGast!),
      scorers: await getMatchScorers(match.id, match.ownSide),
      dateLine
    };
  }

  return {
    ...base,
    kind: "vorschau",
    kickoff: kickoffLabel(match.datum, now),
    dateLine
  };
}
