import { formatDate } from "@/lib/utils/date-format";
import { acronymTeamName } from "@/lib/utils/team-name";

/**
 * Pure Textbausteine für die Instagram-Story-Vorlagen (Aufgabe #44).
 *
 * Bewusst ohne DB-/React-/Window-Import: die zwei Stellen, an denen eine
 * Vorlage still FALSCH werden kann (Logo-Priorität, Ausgangs-Perspektive),
 * sind hier isoliert und unit-getestet — siehe tests/lib/story-content.test.ts.
 */

/* --------------------------------- Wappen -------------------------------- */

/**
 * Was auf einer Seite des Story-Duells angezeigt wird. Bewusst eine Union
 * statt „src?: string": der Kürzel-Fall ist ein GESTALTETER Zustand (der
 * Normalfall bei Amateurvereinen), kein Fehlerfall — nie ein kaputtes Bild.
 */
export type StoryCrest =
  | { kind: "logo"; src: string }
  | { kind: "abbrev"; text: string };

/**
 * Wörter, die eine Mannschaft nicht identifizieren und im Wappen nur Platz
 * fressen: Rollen-/Alters-Prefixe („Herren - FC X") und römische Mannschafts-
 * Ziffern („SV X II" → SVS, nicht SVSII).
 */
const NOISE_WORDS =
  /\b(herren|damen|frauen|männer|junioren|juniorinnen|senioren|mannschaft|team)\b/gi;
const ROMAN_SUFFIX = /\b(I{1,3}|IV|V|VI{1,3}|IX|X)\b/g;

/** Wappen-Kreis fasst ~4 Zeichen — darüber wird es unleserlich klein. */
const MAX_CREST_CHARS = 4;

/**
 * Kürzel für den Kein-Logo-Fall — „SV Sandhausen" → „SVS", „1. FC Köln" → „FCK".
 *
 * Nutzt bewusst {@link acronymTeamName}, das Scoreboard-Kürzel des Projekts:
 * zwei konkurrierende Abkürzungs-Logiken würden für dieselbe Mannschaft
 * unterschiedliche Kürzel liefern (Story „FCB", Spiele-Liste „FCBM") — genau
 * die Art Divergenz, die niemand mehr auflöst.
 *
 * Ergänzt wird nur, was das WAPPEN zusätzlich braucht: Rollen-Wörter und
 * Mannschafts-Ziffern raus (im engen Kreis zählt jedes Zeichen), harte
 * 4-Zeichen-Grenze, und nie ein leeres Ergebnis — die Story hätte sonst ein Loch.
 */
export function teamAbbreviation(name: string): string {
  const cleaned = (name ?? "")
    .replace(NOISE_WORDS, " ")
    .replace(ROMAN_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim();

  const acr = acronymTeamName(cleaned || (name ?? "").trim());
  if (acr) return acr.slice(0, MAX_CREST_CHARS);

  // Murks-Name (leer/nur Leerzeichen): Notnagel statt leerem Wappen.
  const raw = (name ?? "").replace(/\s+/g, "");
  return raw ? raw.slice(0, MAX_CREST_CHARS).toUpperCase() : "?";
}

/**
 * Wappen einer Seite nach Johannes' Priorität (verbindlich, #44):
 *   1) vom Verein hochgeladenes Logo
 *   2) sonst fussball.de-Logo, falls übernehmbar
 *   3) sonst Kürzel des Namens
 *
 * Pro Seite EINZELN aufrufen — eigenes Team kann ein Logo haben, der Gegner
 * nicht. Leere Strings zählen als „kein Logo": ein `src=""` würde im Bild als
 * kaputtes Motiv landen statt sauber auf das Kürzel zu fallen.
 *
 * HINWEIS zu (2): `fussballdeLogo` ist heute IMMER null — der Crawler liest
 * keine Wappen-URLs von fussball.de (Scraper-Erweiterung ist out of scope).
 * Der Parameter hält die von Johannes vorgegebene Priorität explizit offen;
 * sobald es eine Quelle gibt, wird nur der Aufrufer befüllt.
 */
export function pickCrest(args: {
  name: string;
  uploadedLogo?: string | null;
  fussballdeLogo?: string | null;
}): StoryCrest {
  const src = args.uploadedLogo?.trim() || args.fussballdeLogo?.trim();
  if (src) return { kind: "logo", src };
  return { kind: "abbrev", text: teamAbbreviation(args.name) };
}

/* -------------------------------- Rückblick ------------------------------- */

export type RecapOutcome = "sieg" | "unentschieden" | "niederlage";

export interface RecapHeadline {
  outcome: RecapOutcome;
  /** Heimsieg / Auswärtssieg / Unentschieden / Niederlage. */
  headline: string;
  kicker: string;
}

/**
 * Headline eines gespielten Spiels aus der Sicht der EIGENEN Mannschaft.
 *
 * Die Perspektive ist der ganze Punkt: 1:3 ist für den Gast ein Auswärtssieg
 * und für den Heim-Verein eine Niederlage. Deshalb entscheidet `ownSide`
 * (aus `resolveTeamSide` — team-id-basiert, nicht geraten), nicht das rohe
 * Ergebnis. Genau vier Ausgänge, keine Variantenflut.
 */
export function recapHeadline(
  ownSide: "heim" | "gast",
  ergebnisHeim: number,
  ergebnisGast: number
): RecapHeadline {
  const eigene = ownSide === "heim" ? ergebnisHeim : ergebnisGast;
  const fremde = ownSide === "heim" ? ergebnisGast : ergebnisHeim;

  if (eigene > fremde) {
    return ownSide === "heim"
      ? { outcome: "sieg", headline: "Heimsieg", kicker: "Drei Punkte bleiben daheim" }
      : { outcome: "sieg", headline: "Auswärtssieg", kicker: "Punkte im Gepäck" };
  }
  if (eigene < fremde) {
    return {
      outcome: "niederlage",
      headline: "Niederlage",
      kicker: "Nächste Woche zurückschlagen"
    };
  }
  return {
    outcome: "unentschieden",
    headline: "Unentschieden",
    kicker: "Einen Punkt mitgenommen"
  };
}

/* --------------------------------- Vorschau ------------------------------- */

/**
 * Untergrenze für „liegt noch an" bei DATUMS-Werten.
 *
 * `matches.datum` ist kein echter Zeitstempel, sondern ein Kalendertag mit
 * fester Mittagszeit (T12:00:00Z — der Crawler liest keine Anstoßzeit).
 * Gegen `now` verglichen fiele das Spiel des heutigen Tages ab 14:00 Berlin aus
 * der „kommende Spiele"-Liste, obwohl angepfiffen wird — die Karte verschwände
 * am Spieltag mittags. Also auf Tages-Ebene vergleichen: alles ab dem heutigen
 * Kalendertag (Berlin) liegt noch an.
 */
export function berlinDayStart(now: Date): Date {
  return new Date(berlinDayIndex(now) * 86_400_000);
}

/** Kalendertag-Index in Europe/Berlin — DST-fest (keine +24h-Arithmetik). */
function berlinDayIndex(d: Date): number {
  const [day, month, year] = formatDate(d, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  })
    .split(".")
    .map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/**
 * Relatives Anstoß-Label: „Heute" / „Morgen" / „Samstag" / „Sa, 01.08.".
 *
 * Gerechnet wird auf dem BERLINER Kalendertag, nicht auf UTC: ein 20:30-Anstoß
 * ist für den deutschen Nutzer heute, in UTC-Containern aber schnell „gestern"
 * (dieselbe Falle wie in lib/utils/date-format.ts).
 */
export function kickoffLabel(datum: Date, now: Date): string {
  const diff = berlinDayIndex(datum) - berlinDayIndex(now);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Morgen";
  if (diff > 1 && diff < 7) return formatDate(datum, { weekday: "long" });
  return formatDate(datum, { weekday: "short", day: "2-digit", month: "2-digit" });
}
