/**
 * Anzeige-Labels für Match-Events (match_events.type/subtype) im Kunden-UI
 * (z.B. Sponsor-Inbox / Approval-Row).
 *
 * A6 (Audit 2026-06-11): Spezialtor-Subtypen kommen aus
 * `lib/triggers/special-goals.ts` (single source) statt einer eigenen Map —
 * sonst erscheinen neue Subtypen (eckentor, tor_mittellinie, …) als rohe Keys.
 * Unbekannte Subtypen fallen generisch auf „Spezialtor" zurück.
 */
import { SPECIAL_GOAL_SUBTYPE_LABELS } from "@/lib/triggers/special-goals";

/**
 * assist/man_of_match sind eigene Trigger-Typen, werden vom Verein aber als
 * `spezial`-Event gemeldet — eigene Labels statt Spezialtor-Fallback.
 */
const SPEZIAL_EXTRA_LABELS: Record<string, string> = {
  assist: "Vorlage",
  man_of_match: "Spieler des Spiels"
};

export function matchEventLabel(type: string, subtype: string | null): string {
  if (type === "tor") return "Tor";
  if (type === "karte") return subtype === "rot" ? "Rote Karte" : "Gelbe Karte";
  if (type === "spezial") {
    if (subtype) {
      const label =
        SPECIAL_GOAL_SUBTYPE_LABELS[subtype] ?? SPEZIAL_EXTRA_LABELS[subtype];
      if (label) return label;
    }
    return "Spezialtor";
  }
  return type;
}
