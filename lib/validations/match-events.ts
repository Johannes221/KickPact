/**
 * Subtype-Validierung für Match-Events — geteilt zwischen Neuanlage
 * (lib/actions/match-events.ts) und Edit (lib/actions/match-events-edit.ts).
 *
 * Lebt NICHT in den Action-Dateien: "use server"-Module dürfen nur async
 * Funktionen exportieren.
 *
 * B3 (Audit 2026-06-11 / Phase 4): subtype gegen die single source of truth
 * (SPECIAL_GOAL_SUBTYPES) erzwingen — sonst entstehen Events, die kein Pact
 * je matchen kann. Bestands-Events mit Alt-Subtypen (volley/fernschuss/…)
 * bleiben unangetastet; geprüft werden nur Neuanlage und Edit.
 */
import { SPECIAL_GOAL_SUBTYPES } from "@/lib/triggers/special-goals";

/** Erlaubte Karten-Subtypen (Melde-UI bietet genau diese an). */
export const KARTE_SUBTYPES = ["gelb", "rot"] as const;

export function validateSubtype(
  type: "tor" | "auswechslung" | "spezial" | "karte",
  subtype: string | undefined
): { ok: true } | { ok: false; message: string } {
  if (type === "spezial") {
    const allowed = SPECIAL_GOAL_SUBTYPES.map((s) => s.value);
    if (!subtype || !(allowed as string[]).includes(subtype)) {
      return {
        ok: false,
        message: `Unbekannter Spezialtor-Typ „${subtype ?? "—"}". Erlaubt sind: ${allowed.join(", ")}.`
      };
    }
  }
  if (type === "karte") {
    if (!subtype || !(KARTE_SUBTYPES as readonly string[]).includes(subtype)) {
      return {
        ok: false,
        message: `Unbekannter Karten-Typ „${subtype ?? "—"}". Erlaubt sind: gelb, rot.`
      };
    }
  }
  return { ok: true };
}
