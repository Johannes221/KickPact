/**
 * matchHasNameCollision markiert genau die Spiele, bei denen das reine
 * Namens-Matching (detectTeamSide) kippen kann: ein signifikanter Token der
 * eigenen Mannschaft/des Vereins taucht in BEIDEN Seitennamen auf
 * (Reserve-Derby, gleiche Stadt). Nur diese brauchen einen deterministischen
 * team-id-Rescrape — die breite Masse nicht.
 */
import { describe, it, expect } from "vitest";
import {
  matchHasNameCollision,
  significantNameTokens
} from "../../../lib/crawler/team-side";

describe("significantNameTokens", () => {
  it("nimmt nur Wörter >=5 Zeichen, keine Zahlen/Rollen-Prefixe", () => {
    const t = significantNameTokens(["1. Herren", "FC Sportfreunde 1910 Dossenheim"]);
    expect(t.has("sportfreunde")).toBe(true);
    expect(t.has("dossenheim")).toBe(true);
    expect(t.has("herren")).toBe(false); // Rollen-Prefix
    expect(t.has("1910")).toBe(false); // reine Zahl
    expect(t.has("fc")).toBe(false); // < 5 Zeichen
  });
});

describe("matchHasNameCollision", () => {
  it("Reserve-Derby: Vereins-Token in Heim UND Gast → Kollision", () => {
    expect(
      matchHasNameCollision(
        ["2. Mannschaft", "FC Sportfreunde 1910 Dossenheim"],
        "FC Sportfreunde 1910 Dossenheim II",
        "FC Sportfreunde 1910 Dossenheim III"
      )
    ).toBe(true);
  });

  it("Gleiche Stadt: 'weinheim' in beiden Namen → Kollision", () => {
    expect(
      matchHasNameCollision(
        ["1. Herren", "TSG Weinheim"],
        "FC Weinheim",
        "TSG Weinheim"
      )
    ).toBe(true);
  });

  it("distinkte Gegner: Token nur im eigenen Seitennamen → keine Kollision", () => {
    expect(
      matchHasNameCollision(
        ["1. Herren", "SV Schriesheim"],
        "SV Schriesheim",
        "SG Hohensachsen"
      )
    ).toBe(false);
  });

  it("kein Gastname → keine Kollision (nichts zu vergleichen)", () => {
    expect(matchHasNameCollision(["SV Schriesheim"], "SV Schriesheim", null)).toBe(
      false
    );
  });

  it("nur kurze/rollen-Token gemeinsam (z.B. 'Herren') → keine Kollision", () => {
    // "Herren" ist Rollen-Prefix und wird ignoriert; sonst keine Überschneidung.
    expect(
      matchHasNameCollision(
        ["Herren", "SV Alpha"],
        "Herren SV Alpha",
        "Herren FC Beta"
      )
    ).toBe(false);
  });
});
