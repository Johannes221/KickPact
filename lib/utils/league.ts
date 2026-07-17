/**
 * Liga-/Spielklassen-Helfer (pure, ohne DB/Browser). Genutzt vom Scraper
 * (`lib/crawler/fussballde.ts`), den Discovery-Queries und der UI.
 */

const WEEKDAY_TOKENS = new Set(["mo", "di", "mi", "do", "fr", "sa", "so"]);

/**
 * Altersklassen sind KEINE Liga. fussball.de führt sie im selben Segment wie die
 * Uhrzeit ("14:00 Herren"), teils anstelle einer Liga — ohne diese Liste hieße
 * die Liga einer Herrenmannschaft schlicht "Herren".
 */
const AGE_GROUP_RE =
  /^(herren|frauen|senioren|alte herren|[a-g]-junioren|[a-d]-juniorinnen|ü\s?\d{2}|u\s?\d{1,2})$/i;

/** Führende Uhrzeit ("19:00 Kreisliga ME" → "Kreisliga ME") abstreifen. */
export function stripLeadingTime(value: string): string {
  return value.replace(/^\d{1,2}[:.]\d{2}\s*(uhr)?\s*/i, "").trim();
}

/** Ist der Wert bloß eine Altersklasse (und damit keine Liga)? */
export function isAgeGroup(value: string | null | undefined): boolean {
  return AGE_GROUP_RE.test((value ?? "").trim());
}

/**
 * fussball.de hängt an jeden Wettbewerb einen Zwei-Buchstaben-Marker:
 *   "Landesliga ME"                → ME = Meisterschaft (= die Liga)
 *   "Verbandspokal PO"             → PO = Pokal
 *   "Kreisfreundschaftsspiele FS"  → FS = Freundschaftsspiel
 *   "Vereinsturnier TU"            → TU = Vereins-/Hallenturnier
 * Nur ME ist die Liga der Mannschaft. Der Marker ist Scraper-Interna und gehört
 * nicht in die Anzeige — "Landesliga ME" wäre auf einem Sponsoren-Profil Kauderwelsch.
 *
 * GELD hängt daran (Entscheid 2026-07-17: nur Liga + Pokal zahlen). `friendly`
 * ist deshalb die Kategorie „kein Wettkampf im Sinne des Geld-Gates" und fasst
 * Freundschaftsspiele UND Turniere zusammen — ein Vereinsturnier ist so wenig
 * ein Wettkampf wie ein Testspiel. (Kein eigener Enum-Wert: `matches.
 * competition_type` ist bereits ausgerollt, und ein ALTER TYPE ADD VALUE ist die
 * bekannte Falle des Test-Migrators.)
 *
 * Ein Marker, der hier FEHLT, landet auf `unknown` und zahlt still weiter —
 * genau so wäre TU durchgerutscht. `tests/scraper/parser/competition-markers.
 * test.ts` schlägt an, sobald in den Captures ein unbekanntes Kürzel auftaucht.
 */
export type CompetitionType = "league" | "friendly" | "cup" | "unknown";

const TYPE_MARKERS: Record<string, CompetitionType> = {
  ME: "league",
  PO: "cup",
  FS: "friendly",
  TU: "friendly"
};

/**
 * Wettbewerbsart für die `matches.competition_type`-Spalte. Kennt der Marker
 * uns nichts (fehlt, unbekannt, Zeile leer), ist das ehrlich `unknown` — NICHT
 * `league`: eine Vermutung im Geld-Pfad wäre schlimmer als bekanntes Unwissen
 * (siehe Gate in evaluate-match).
 */
export function competitionTypeOf(
  raw: string | null | undefined
): CompetitionType {
  return parseCompetition(raw).type;
}

/** "Landesliga ME" → { name: "Landesliga", type: "league" } */
export function parseCompetition(raw: string | null | undefined): {
  name: string;
  type: CompetitionType;
} {
  const v = (raw ?? "").trim();
  const m = v.match(/^(.*?)\s+([A-Z]{2})$/);
  if (!m) return { name: v, type: "unknown" };
  const type = TYPE_MARKERS[m[2]];
  return type ? { name: m[1].trim(), type } : { name: v, type: "unknown" };
}

/**
 * Die Liga einer Mannschaft aus den Wettbewerbs-Angaben ihrer Spiele.
 *
 * Zwei Fallen, beide 2026-07-17 live belegt:
 *  - NICHT den ersten Treffer nehmen: prev.games liefert das jüngste Spiel
 *    zuerst, in der Sommerpause also ein Freundschaftsspiel.
 *  - NICHT bloß die Mehrheit nehmen: die B-Junioren hatten im Juli AUSSCHLIESSLICH
 *    Freundschaftsspiele gescrapt → „Kreisfreundschaftsspiele" wäre die Mehrheit
 *    und damit ihre vermeintliche Liga geworden.
 * Deshalb: nur Meisterschaftsspiele (ME) zählen, davon der häufigste Wert. Findet
 * sich keins, lieber null — keine Liga ist ehrlicher als eine erfundene.
 *
 * Bei Gleichstand gewinnt der zuerst gesehene Wert (stabil, nicht zufällig).
 */
export function pickTeamLeague(
  values: ReadonlyArray<string | null | undefined>
): string | null {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const { name, type } = parseCompetition(raw);
    if (type !== "league") continue;
    if (!isPlausibleLeague(name)) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [v, n] of counts) {
    if (n > bestCount) {
      best = v;
      bestCount = n;
    }
  }
  return best;
}

/**
 * Prüft, ob ein Wert eine plausible Liga/Spielklasse ist. Wehrt die Werte ab,
 * die der alte Parser fälschlich als Liga gespeichert hat — vor allem den
 * Wochentag ("So" = Sonntag), aber auch Uhrzeiten, Datumsangaben und reine
 * Wettbewerbs-IDs. Dient zugleich als Defense-in-depth, damit solcher Müll
 * weder gespeichert noch im Filter/Karten-Untertitel angezeigt wird.
 */
export function isPlausibleLeague(value: string | null | undefined): boolean {
  const v = (value ?? "").trim();
  if (v.length < 2) return false;
  if (WEEKDAY_TOKENS.has(v.toLowerCase().replace(/\.$/, ""))) return false; // Wochentag
  if (/^\d+$/.test(v)) return false; // reine Wettbewerb-ID
  if (/^\d{1,2}[:.]\d{2}/.test(v)) return false; // Uhrzeit "14:00"
  if (/^\d{1,2}\.\d{1,2}\.\d{2,4}/.test(v)) return false; // Datum
  if (isAgeGroup(v)) return false; // "Herren"/"C-Junioren" ist keine Liga
  return true;
}
