/**
 * A6 (Phase 4 / Sponsor-Journey): Labels für Match-Events in der Sponsor-Inbox.
 *
 * Die Spezialtor-Subtypen kommen aus lib/triggers/special-goals.ts (single
 * source) — eine eigene Map in approval-row.tsx ließ eckentor/tor_mittellinie
 * als rohe Strings durchfallen. Unbekannte Subtypen fallen generisch auf
 * „Spezialtor" zurück.
 */
import { describe, expect, it } from "vitest";
import { matchEventLabel } from "@/lib/triggers/event-labels";
import { SPECIAL_GOAL_SUBTYPES } from "@/lib/triggers/special-goals";

describe("matchEventLabel", () => {
  it("Tor + Karten bleiben wie gehabt", () => {
    expect(matchEventLabel("tor", null)).toBe("Tor");
    expect(matchEventLabel("karte", "gelb")).toBe("Gelbe Karte");
    expect(matchEventLabel("karte", "rot")).toBe("Rote Karte");
  });

  it("alle kanonischen Spezialtor-Subtypen liefern ihr special-goals-Label", () => {
    for (const s of SPECIAL_GOAL_SUBTYPES) {
      expect(matchEventLabel("spezial", s.value)).toBe(s.label);
    }
  });

  it("eckentor/tor_mittellinie erscheinen nicht mehr als rohe Keys", () => {
    expect(matchEventLabel("spezial", "eckentor")).toBe("Eckentor direkt");
    expect(matchEventLabel("spezial", "tor_mittellinie")).toBe(
      "Tor hinter Mittellinie"
    );
  });

  it("assist/man_of_match (eigene Trigger, als spezial gemeldet) haben eigene Labels", () => {
    expect(matchEventLabel("spezial", "assist")).toBe("Vorlage");
    expect(matchEventLabel("spezial", "man_of_match")).toBe("Spieler des Spiels");
  });

  it("unbekannter Subtype fällt generisch auf Spezialtor zurück", () => {
    expect(matchEventLabel("spezial", "fallrueckzieher_3000")).toBe("Spezialtor");
    expect(matchEventLabel("spezial", "sonstiges")).toBe("Spezialtor");
    expect(matchEventLabel("spezial", null)).toBe("Spezialtor");
  });

  it("unbekannter Event-Typ wird durchgereicht", () => {
    expect(matchEventLabel("eigentor", null)).toBe("eigentor");
  });
});
