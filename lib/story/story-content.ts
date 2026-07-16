import { formatDate } from "@/lib/utils/date-format";

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

/** Vereinstyp-Präfixe, die als Ganzes ins Kürzel wandern („FC Köln" → „FCK"). */
const CLUB_TYPE_TOKENS = new Set([
  "fc", "sv", "sc", "tsv", "tsg", "vfb", "vfl", "vfr", "spvgg", "sg", "sgm",
  "djk", "mtv", "fsv", "ssv", "asv", "bsc", "tus", "tv", "rsv", "sp", "spfr"
]);

/** Wörter, die eine Mannschaft NICHT identifizieren (Rollen-/Alters-Prefixe). */
const NOISE_WORDS = new Set([
  "herren", "damen", "frauen", "männer", "junioren", "juniorinnen", "senioren",
  "mannschaft", "team"
]);

/** Römische Mannschafts-Ziffern („SV X II") — kein Namensbestandteil. */
const ROMAN_SUFFIX = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/;

/**
 * Kürzel für den Kein-Logo-Fall, nach der geläufigen deutschen Vereins-Kurzform:
 *   - mit Vereinstyp-Präfix → Präfix + Initiale des Ortes („FC Bayern München"
 *     → FCB, „1. FC Köln" → FCK, „TSG Hoffenheim" → TSGH). Das Präfix trägt die
 *     Vereins-Identität, eine Orts-Initiale reicht.
 *   - ohne Präfix → Initialen aller Wörter („Sportfreunde Dossenheim" → SD).
 *
 * Hart auf 4 Zeichen gedeckelt (mehr läuft im Wappen-Kreis über). Liefert NIE
 * einen leeren String — die Story hätte sonst ein Loch.
 */
export function teamAbbreviation(name: string): string {
  const words = (name ?? "")
    .toLowerCase()
    .split(/[\s/\\.,\-–—]+/)
    .filter(
      (w) =>
        w.length > 0 &&
        !/^\d+$/.test(w) &&          // Gründungsjahre („1916"), Spieltags-Ziffern
        !NOISE_WORDS.has(w) &&
        !ROMAN_SUFFIX.test(w)
    );

  if (words.length === 0) {
    // Murks-Name (nur Ziffern/Leerzeichen): lieber die ersten Buchstaben des
    // Rohnamens als ein leeres Wappen. Notnagel „?" nur, wenn gar nichts da ist.
    const raw = (name ?? "").replace(/\s+/g, "");
    return raw ? raw.slice(0, 3).toUpperCase() : "?";
  }

  const [first, ...rest] = words;
  if (CLUB_TYPE_TOKENS.has(first)) {
    const ort = rest[0]?.[0]?.toUpperCase() ?? "";
    return (first.toUpperCase() + ort).slice(0, 4);
  }
  return words.map((w) => w[0].toUpperCase()).join("").slice(0, 4);
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
