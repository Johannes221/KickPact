import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Was schon gepostet wurde — der Schutz gegen Doppelposts.
 *
 * Ein Post ist NICHT zurückholbar. Der Runner darf denselben Eintrag also
 * niemals zweimal veröffentlichen, egal wie oft er läuft (Cron feuert doppelt,
 * jemand startet ihn von Hand nach, der Rechner hängt mitten drin). Deshalb ist
 * das hier append-only und wird VOR jedem einzelnen Upload geprüft.
 *
 * Feingranular bis auf den einzelnen Story-Slide: bricht ein Highlight nach
 * Slide 3 von 6 ab, postet der nächste Lauf nur 4 bis 6 nach, nicht wieder von
 * vorne. Sonst stünden die ersten drei Slides doppelt in der Story.
 *
 * Format: JSONL, eine Zeile pro erfolgreichem Post. Bewusst append-only und
 * menschenlesbar — im Zweifel öffnet man die Datei und sieht, was raus ist.
 */

const LOG = join(process.cwd(), "scripts/social/state/posted.jsonl");

export interface PostedEntry {
  /** Eindeutiger Schlüssel, s. postKey(). Gegen ihn wird dedupliziert. */
  key: string;
  /** Instagram-Media-ID der Veröffentlichung — der Beleg. */
  mediaId: string;
  /** Wann gepostet (ISO). Wird vom Aufrufer gesetzt, nicht hier. */
  at: string;
}

/**
 * Der Schlüssel, unter dem ein Post als erledigt gilt.
 *
 * Für Stories mit Slide-Index, weil jeder Slide ein eigener, unwiderruflicher
 * Post ist. Für Reels reicht kind+slug.
 */
export function postKey(kind: string, slug: string, slideIndex?: number): string {
  return slideIndex === undefined ? `${kind}:${slug}` : `${kind}:${slug}:${slideIndex}`;
}

/** Alle bereits geposteten Schlüssel. Leer, wenn noch nie gepostet wurde. */
export function loadPosted(): Set<string> {
  if (!existsSync(LOG)) return new Set();
  const keys = new Set<string>();
  for (const line of readFileSync(LOG, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      keys.add((JSON.parse(trimmed) as PostedEntry).key);
    } catch {
      // Kaputte Zeile überspringen, nicht den ganzen Lauf abbrechen: ein
      // halb geschriebener Eintrag (Rechner mitten im Append aus) darf nicht
      // dazu führen, dass der Schutz komplett ausfällt und alles doppelt geht.
    }
  }
  return keys;
}

/**
 * Einen erfolgreichen Post festhalten.
 *
 * MUSS unmittelbar nach dem publish aufgerufen werden, bevor irgendetwas anderes
 * schiefgehen kann. Die Reihenfolge ist die halbe Sicherheit: erst posten, dann
 * sofort protokollieren. Fällt der Prozess dazwischen, ist im schlimmsten Fall
 * ein Post nicht protokolliert (und würde einmal wiederholt) — der umgekehrte
 * Fehler (protokolliert, aber nicht gepostet) wäre schlimmer, denn dann fehlte
 * der Post für immer still.
 */
export function markPosted(entry: PostedEntry): void {
  mkdirSync(dirname(LOG), { recursive: true });
  appendFileSync(LOG, JSON.stringify(entry) + "\n", "utf8");
}
