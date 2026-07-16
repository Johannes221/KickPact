/**
 * Subscription-Status → deutscher Klartext für die Abo-Karte.
 *
 * Ein Vereinsvorstand liest keine DB-Enums: „incomplete" sagt ihm nichts,
 * „Zahlung nicht abgeschlossen" schon — plus ein Satz, was jetzt zu tun ist.
 * Single source of truth für die Status-Anzeige im Abo-Panel. Keine
 * DB-Abhängigkeit, pure Lookup-Tabelle (Typ-Import wird wegkompiliert).
 */

import type { SubscriptionStatus } from "@/lib/db/queries/subscription-status";

/**
 * Semantik statt Farbe: „so steht's" (success), „kümmer dich drum"
 * (attention), „nichts läuft mehr" (neutral). Das Mapping auf konkrete
 * Klassen passiert im UI, nicht hier.
 */
export type StatusTone = "success" | "attention" | "neutral";

export type SubscriptionStatusInfo = {
  /** Der Zustand in einer lesbaren Nominalphrase („Abo aktiv"). */
  label: string;
  /**
   * Ein Satz: was ist Sache + was kann der Verein tun. `null`, wenn die Karte
   * den Zustand ohnehin schon mit konkretem Datum ausführt (Trial/Sommerpause)
   * — sonst stünde dasselbe zweimal untereinander.
   */
  hint: string | null;
  tone: StatusTone;
};

const STATUS_INFO: Record<SubscriptionStatus, SubscriptionStatusInfo> = {
  trialing: {
    label: "Testphase läuft",
    hint: null,
    tone: "success"
  },
  active: {
    label: "Abo aktiv",
    hint: null,
    tone: "success"
  },
  past_due: {
    label: "Zahlung fehlgeschlagen",
    hint: "Die letzte Abbuchung hat nicht geklappt. Aktualisiere deine Zahlungsdaten — sonst wird das Abo in den nächsten Tagen pausiert.",
    tone: "attention"
  },
  paused: {
    label: "Sommerpause",
    hint: null,
    tone: "attention"
  },
  cancelled: {
    label: "Abo beendet",
    hint: "Es wird nichts mehr abgebucht. Du kannst jederzeit wieder buchen — eure Daten bleiben erhalten.",
    tone: "neutral"
  },
  incomplete: {
    label: "Zahlung nicht abgeschlossen",
    hint: "Der Kauf wurde gestartet, aber nie zu Ende geführt — deshalb läuft das Abo noch nicht. Buch den Plan einfach erneut, dann ist er sofort aktiv.",
    tone: "attention"
  }
};

/**
 * Nimmt bewusst einen rohen `string` (die Karte liest den Status direkt aus der
 * DB-Row): ein unbekannter/neuer Enum-Wert darf niemals als nackter Rohwert im
 * UI landen.
 */
export function getSubscriptionStatusInfo(
  status: string
): SubscriptionStatusInfo {
  return (
    STATUS_INFO[status as SubscriptionStatus] ?? {
      label: "Status wird geprüft",
      hint: "Wir konnten den Zustand deines Abos gerade nicht eindeutig bestimmen. Melde dich bei uns, wenn das so bleibt.",
      tone: "neutral"
    }
  );
}
