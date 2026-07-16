import { describe, it, expect } from "vitest";
import {
  pickCrest,
  teamAbbreviation,
  recapHeadline,
  kickoffLabel
} from "@/lib/story/story-content";

/**
 * Pure Story-Logik (Aufgabe #44). Genau die zwei Stellen, an denen eine
 * Vorlage still falsch werden kann:
 *   (a) Logo-Priorität — hochgeladen schlägt fussball.de schlägt Kürzel,
 *       und das PRO SEITE einzeln (eigenes Logo da, Gegner nicht).
 *   (b) Headline-Perspektive — 1:3 ist aus Gast-Sicht ein Auswärtssieg und
 *       aus Heim-Sicht eine Niederlage. Kippt das, lügt die Story die
 *       Mannschaft an.
 */

describe("teamAbbreviation", () => {
  it("Vereins-Kürzel wie im Rest der App (acronymTeamName)", () => {
    expect(teamAbbreviation("SV Sandhausen")).toBe("SVS");
    expect(teamAbbreviation("1. FC Köln")).toBe("FCK");
  });

  it("ignoriert Jahreszahlen, Rollen-Wörter und Mannschafts-Ziffern", () => {
    expect(teamAbbreviation("SV Sandhausen 1916 II")).toBe("SVS");
    expect(teamAbbreviation("Herren - TSG Hoffenheim")).toBe("TSGH");
  });

  it("ohne Vereinstyp-Präfix: Initialen der Wörter", () => {
    expect(teamAbbreviation("Sportfreunde Dossenheim")).toBe("SD");
  });

  it("liefert nie etwas Leeres — auch bei Murks-Namen", () => {
    expect(teamAbbreviation("1916")).not.toBe("");
    expect(teamAbbreviation("")).not.toBe("");
    expect(teamAbbreviation("   ")).not.toBe("");
  });

  it("deckelt die Länge (Crest-Kreis darf nicht überlaufen)", () => {
    expect(
      teamAbbreviation("SpVgg Neckarelz Mosbach Diedesheim Obrigheim").length
    ).toBeLessThanOrEqual(4);
  });
});

describe("pickCrest — Logo-Priorität", () => {
  it("1) hochgeladenes Vereinslogo schlägt alles", () => {
    expect(
      pickCrest({
        name: "SV Sandhausen",
        uploadedLogo: "data:image/png;base64,AAA",
        fussballdeLogo: "data:image/png;base64,BBB"
      })
    ).toEqual({ kind: "logo", src: "data:image/png;base64,AAA" });
  });

  it("2) ohne Upload: fussball.de-Logo", () => {
    expect(
      pickCrest({
        name: "SV Sandhausen",
        uploadedLogo: null,
        fussballdeLogo: "data:image/png;base64,BBB"
      })
    ).toEqual({ kind: "logo", src: "data:image/png;base64,BBB" });
  });

  it("3) ohne jedes Logo: Kürzel statt kaputtes Bild", () => {
    expect(
      pickCrest({ name: "SV Sandhausen", uploadedLogo: null, fussballdeLogo: null })
    ).toEqual({ kind: "abbrev", text: "SVS" });
  });

  it("leere Strings zählen als kein Logo (nicht als gültige src)", () => {
    expect(
      pickCrest({ name: "SV Sandhausen", uploadedLogo: "", fussballdeLogo: "" })
    ).toEqual({ kind: "abbrev", text: "SVS" });
  });

  it("entscheidet pro Seite einzeln — eigenes Logo da, Gegner nicht", () => {
    const eigen = pickCrest({ name: "SV Sandhausen", uploadedLogo: "data:image/png;base64,AAA" });
    const gegner = pickCrest({ name: "FC Sportfreunde Dossenheim" });
    expect(eigen.kind).toBe("logo");
    expect(gegner).toEqual({ kind: "abbrev", text: "FCSD" });
  });
});

describe("recapHeadline — Ausgang aus eigener Perspektive", () => {
  it("Heim + gewonnen → Heimsieg", () => {
    const r = recapHeadline("heim", 3, 1);
    expect(r.outcome).toBe("sieg");
    expect(r.headline).toBe("Heimsieg");
  });

  it("Gast + gewonnen → Auswärtssieg", () => {
    const r = recapHeadline("gast", 1, 3);
    expect(r.outcome).toBe("sieg");
    expect(r.headline).toBe("Auswärtssieg");
  });

  it("Gast + Heim führt → Niederlage (Perspektive dreht das Ergebnis)", () => {
    const r = recapHeadline("gast", 3, 1);
    expect(r.outcome).toBe("niederlage");
    expect(r.headline).toBe("Niederlage");
  });

  it("Heim + Gast führt → Niederlage", () => {
    const r = recapHeadline("heim", 1, 3);
    expect(r.outcome).toBe("niederlage");
    expect(r.headline).toBe("Niederlage");
  });

  it("gleiches Ergebnis → Unentschieden, egal welche Seite", () => {
    expect(recapHeadline("heim", 2, 2).headline).toBe("Unentschieden");
    expect(recapHeadline("gast", 2, 2).headline).toBe("Unentschieden");
    expect(recapHeadline("heim", 0, 0).outcome).toBe("unentschieden");
  });

  it("0:0 ist kein Sieg (Falsy-Fallen bei 0)", () => {
    expect(recapHeadline("gast", 0, 0).outcome).toBe("unentschieden");
  });

  it("liefert immer einen nicht-leeren Kicker", () => {
    for (const side of ["heim", "gast"] as const) {
      for (const [h, g] of [[3, 1], [1, 3], [2, 2]]) {
        expect(recapHeadline(side, h, g).kicker.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("kickoffLabel — relatives Datum (Europe/Berlin)", () => {
  // 2026-07-16 ist ein Donnerstag.
  const now = new Date("2026-07-16T10:00:00+02:00");

  it("selber Kalendertag → Heute", () => {
    expect(kickoffLabel(new Date("2026-07-16T19:30:00+02:00"), now)).toBe("Heute");
  });

  it("späterer Anstoß am selben Tag bleibt Heute (Uhrzeit egal)", () => {
    expect(kickoffLabel(new Date("2026-07-16T23:30:00+02:00"), now)).toBe("Heute");
  });

  it("nächster Kalendertag → Morgen", () => {
    expect(kickoffLabel(new Date("2026-07-17T15:00:00+02:00"), now)).toBe("Morgen");
  });

  it("innerhalb der Woche → Wochentag", () => {
    expect(kickoffLabel(new Date("2026-07-18T15:00:00+02:00"), now)).toBe("Samstag");
    expect(kickoffLabel(new Date("2026-07-19T15:00:00+02:00"), now)).toBe("Sonntag");
  });

  it("weiter weg → Kurzdatum mit Wochentag", () => {
    expect(kickoffLabel(new Date("2026-08-01T15:00:00+02:00"), now)).toBe("Sa., 01.08.");
  });

  it("Berlin-Kalendertag zählt, nicht UTC (23:30 Berlin = noch heute)", () => {
    // 2026-07-16T22:30Z = 2026-07-17T00:30 Berlin → aus Berliner Sicht MORGEN,
    // obwohl es in UTC noch der 16. ist.
    expect(kickoffLabel(new Date("2026-07-16T22:30:00Z"), now)).toBe("Morgen");
  });
});
