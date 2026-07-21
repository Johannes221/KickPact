import { readDocumentBytes } from "@/lib/storage/documents";
import { getCachedStandingsForRequest } from "@/lib/recap/standings-request";
import type { LeagueStandings } from "@/lib/crawler/fussballde";
import {
  getStoryTeam,
  getStoryMatch,
  getMatchScorers,
  getOpponentLogoUrl,
  type StoryScorer
} from "@/lib/db/queries/story";
import { getClubCrestLogoUrl } from "@/lib/db/queries/club-crests";
import { formatDate } from "@/lib/utils/date-format";
import { currentSaisonCode } from "@/lib/utils/saison";
import { hasResult } from "@/lib/matches/display-state";
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
 * Satori (next/og) rastert nur PNG/JPEG. WebP kann es nicht bloß nicht — resvg
 * WIRFT an WebP-Bytes ('u2 is not iterable', empirisch verifiziert), was das
 * ganze Motiv killt statt nur das Wappen. Ein Konverter (sharp) ist nicht im
 * Stack. Seit dem Upload-Fix (lib/storage/images.ts) werden neue WebP-Logos gar
 * nicht mehr gespeichert; dieser Guard fängt nur noch VOR dem Fix hochgeladene
 * WebP-Bestände ab → `null` → Kürzel-Fallback statt Crash.
 * Format über Magic Bytes bestimmen, nicht über die Endung: die Endung ist bloß
 * der Storage-Key, die Bytes sind die Wahrheit.
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
  /**
   * true = Heimspiel, false = Auswärtsspiel, null = eigene Seite nicht sicher
   * bestimmbar (Reserve-Derby ohne team-ids, s. StoryMatch.ownSideReliable) →
   * die Vorlage schweigt dazu, statt das Falsche zu behaupten.
   */
  heimspiel: boolean | null;
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
  /**
   * Ausgang aus eigener Sicht — null, wenn die eigene Seite nicht sicher
   * bestimmbar ist (s. StoryMatch.ownSideReliable). Dann zeigt die Vorlage nur
   * den Endstand: „Heimsieg" vs. „Niederlage" zu verwechseln wäre der
   * schlimmste denkbare Fehler auf einer geteilten Story.
   */
  headline: RecapHeadline | null;
  /** Torschützen der EIGENEN Seite — oft leer (fussball.de-Coverage). */
  scorers: StoryScorer[];
  dateLine: string;
}

export type StoryModel = PreviewStory | RecapStory;

/**
 * Baut das Story-Modell für ein Spiel der Mannschaft. Wählt die Vorlage selbst:
 * Spiel mit Endstand → Rückblick, sonst → Vorschau.
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
  // Gegner-Name als Fallback für die Wappen-Auflösung: matches speichern für
  // externe Gegner keine team-id (nur den Namen), also muss das Wappen notfalls
  // per Name aus dem club_crests-Cache kommen.
  const opponentName = ownIsHeim ? match.gastName : match.heimName;

  // Tabelle der Saison DES SPIELS, nicht der aktuellen Team-Saison: `matches`
  // hat keine saison-Spalte, die Zuordnung läuft übers Datum. Sonst klebte an
  // einem Vorsaison-Rückblick der diesjährige Tabellenplatz („Platz 3" über
  // eine Saison, die als 11. endete).
  // Nie synchron scrapen (Request-Pfad) — bei Miss kommt null und der
  // Prewarm-Job füllt für den nächsten Aufruf nach.
  const matchSaison = currentSaisonCode(match.datum);
  const [ownLogo, opponentLogo, standings] = await Promise.all([
    // Eigenes Wappen: hochgeladenes Logo — sonst (Fallback) das gescrapte
    // Wappen per eigener team-id, falls kein Logo hochgeladen/lesbar ist.
    logoDataUrl(team.logoUrl).then(
      async (l) => l ?? logoDataUrl(await getClubCrestLogoUrl(team.fussballdeTeamId))
    ),
    getOpponentLogoUrl(opponentFussballdeTeamId, opponentName).then(logoDataUrl),
    getCachedStandingsForRequest(teamId, matchSaison).catch(() => null)
  ]);

  // Eigenes Wappen: der Crawl setzt das fussball.de-Wappen automatisch auf
  // teams.logoUrl (nur solange keins hochgeladen ist) — es kommt hier also
  // schon über ownLogo. Gegner-Wappen: getOpponentLogoUrl liefert das
  // hochgeladene ODER (fallback) das öffentliche fussball.de-Wappen.
  const ownCrest = pickCrest({
    name: ownIsHeim ? match.heimName : match.gastName,
    uploadedLogo: ownLogo
  });
  const opponentCrest = pickCrest({
    name: ownIsHeim ? match.gastName : match.heimName,
    uploadedLogo: opponentLogo
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

  // Endstand liegt vor → Rückblick, sonst Vorschau. Bewusst über den
  // gemeinsamen `hasResult` und damit am ERGEBNIS festgemacht, nicht am Status:
  // fussball.de trägt das Ergebnis oft erst Tage nach dem Anstoß nach, bis
  // dahin bleibt die Row `scheduled` — die Story hätte für ein längst
  // gespieltes Spiel eine „Vorschau" gezeigt.
  if (hasResult(match)) {
    // Ohne verlässliche Seite: nur der Endstand (der stimmt immer) — keine
    // Ausgangs-Headline, keine „unsere" Torschützen.
    return {
      ...base,
      kind: "rueckblick",
      ergebnisHeim: match.ergebnisHeim!,
      ergebnisGast: match.ergebnisGast!,
      headline: match.ownSideReliable
        ? recapHeadline(match.ownSide, match.ergebnisHeim!, match.ergebnisGast!)
        : null,
      scorers: match.ownSideReliable ? await getMatchScorers(match.id, match.ownSide) : [],
      dateLine
    };
  }

  return {
    ...base,
    kind: "vorschau",
    kickoff: kickoffLabel(match.datum, now),
    dateLine,
    heimspiel: match.ownSideReliable ? match.ownSide === "heim" : null
  };
}
