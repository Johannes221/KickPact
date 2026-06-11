/**
 * Manuelle Trigger = vom Verein gemeldete Ereignisse ohne fussball.de-Beleg.
 * Charges daraus brauchen Sponsor-Bestätigung (status='pending_approval').
 *
 * EINE Quelle (Audit 2026-06-11 / C6): vorher hielten create-pledge.ts und
 * lib/actions/pledges.ts je eine eigene Kopie dieser Liste — Drift zwischen
 * beiden hätte still requiresApproval-Flags auseinanderlaufen lassen.
 *
 * `season_custom` ist seit Audit 2026-06-11 / C2 ebenfalls approval-pflichtig:
 * der Verein behauptet das Custom-Saisonziel selbst (customNotes), der Sponsor
 * bestätigt direkt auf der Charge (lib/actions/season-charges.ts).
 */
export const MANUAL_TRIGGERS: ReadonlySet<string> = new Set<string>([
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom",
  "season_custom"
]);
