/**
 * Wählbare Subtypen für den `special_goal`-Trigger.
 *
 * Single source of truth für:
 *   - den Subtyp-Auswähler im Sponsor-Pact-UI (Pledge-Editor + Builder),
 *   - die Melde-UI des Vereins (manuelles Spezialtor-Event),
 *   - die Label-Tabelle in `lib/billing/trigger-labels.ts`.
 *
 * Der gespeicherte `value` landet als `params.subtype` in `trigger_params_json`
 * bzw. als `match_events.subtype`; ein Pact feuert nur, wenn beide übereinstimmen.
 * Reihenfolge = Anzeigereihenfolge im Dropdown.
 */
export const SPECIAL_GOAL_SUBTYPES = [
  { value: "kopfball", label: "Kopfballtor" },
  { value: "hackentor", label: "Hackentor" },
  { value: "elfmeter", label: "Elfmeter" },
  { value: "freistoss", label: "Freistoßtor" },
  { value: "eckentor", label: "Eckentor direkt" },
  { value: "tor_mittellinie", label: "Tor hinter Mittellinie" }
] as const;

export type SpecialGoalSubtype = (typeof SPECIAL_GOAL_SUBTYPES)[number]["value"];

/** value → Label, abgeleitet aus der Liste (eine Quelle). */
export const SPECIAL_GOAL_SUBTYPE_LABELS: Record<string, string> =
  Object.fromEntries(SPECIAL_GOAL_SUBTYPES.map((s) => [s.value, s.label]));

/**
 * Nicht mehr wählbare Alt-Subtypen aus der früheren (hardcodeten) Melde-UI.
 * Neue Events dürfen sie NICHT mehr verwenden (Server-Validierung in
 * `lib/actions/match-events.ts`), aber Bestands-Events bleiben lesbar.
 */
export const LEGACY_SPECIAL_GOAL_SUBTYPE_LABELS: Record<string, string> = {
  volley: "Volley",
  fernschuss: "Fernschuss",
  assist: "Vorlage (Assist)",
  man_of_match: "Spieler des Spiels",
  sonstiges: "Sonstiges Spezialtor"
};

/** Anzeige-Label mit Fallback für Alt-Subtypen und rohe Werte. */
export function specialGoalSubtypeLabel(
  subtype: string | null | undefined
): string {
  if (!subtype) return "Spezial-Event";
  return (
    SPECIAL_GOAL_SUBTYPE_LABELS[subtype] ??
    LEGACY_SPECIAL_GOAL_SUBTYPE_LABELS[subtype] ??
    subtype
  );
}
