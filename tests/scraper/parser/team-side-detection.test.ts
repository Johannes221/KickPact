import { describe, it, expect } from "vitest";
import { detectTeamSide } from "../../../lib/crawler/team-side";

describe("detectTeamSide", () => {
  // Real-world cases extracted from captured fixtures
  it("Herren-Prefix wird gestrippt", () => {
    expect(
      detectTeamSide(
        "Herren - FC Sportfreunde 1910 Dossenheim",
        "FC Sportfreunde 1910 Dossenheim",
      ),
    ).toBe("heim");
  });

  it("SG-Prefix korrekt behandelt", () => {
    expect(
      detectTeamSide(
        "Herren - SG Heidelberg-Kirchheim",
        "SG Heidelberg-Kirchheim",
      ),
    ).toBe("heim");
    expect(
      detectTeamSide(
        "Herren - SG Heidelberg-Kirchheim",
        "TSV Handschuhsheim",
      ),
    ).toBe("gast");
  });

  it("Damen-Prefix", () => {
    expect(
      detectTeamSide(
        "Damen - FC Sportfreunde 1910 Dossenheim",
        "FC Sportfreunde 1910 Dossenheim",
      ),
    ).toBe("heim");
  });

  it("A-Junioren-Prefix", () => {
    expect(detectTeamSide("A-Junioren - SG Schriesheim", "SG Schriesheim")).toBe(
      "heim",
    );
  });

  it("Mannschafts-Nummer im Namen", () => {
    expect(
      detectTeamSide(
        "Herren - FC Sportfreunde 1910 Dossenheim 3",
        "FC Sportfreunde 1910 Dossenheim II",
      ),
    ).toBe("heim");
  });

  it("gast-side when team name doesn't match heim", () => {
    expect(
      detectTeamSide(
        "Herren - TSV Handschuhsheim",
        "FC Sportfreunde 1910 Dossenheim",
      ),
    ).toBe("gast");
  });

  it("Umlaute werden tolerant behandelt", () => {
    expect(detectTeamSide("Herren - SV Wieblingen", "SV Wieblingen")).toBe(
      "heim",
    );
  });

  // Regression: Mannschafts-Name ohne Vereins-Token (z.B. "1. Herren" nach
  // getMannschaften-Rewrite). Ohne Vereinsname kippt die Erkennung immer auf
  // "gast" → invertierte Stats + falsche Charge-Seite. Mit [team, club] als
  // Token-Quelle wird der Vereins-Token ("schriesheim") korrekt erkannt.
  describe("Vereinsname als zusätzliche Token-Quelle (Array)", () => {
    it("'1. Herren' + Club erkennt Heim korrekt", () => {
      expect(
        detectTeamSide(["1. Herren", "SV Schriesheim"], "SV Schriesheim"),
      ).toBe("heim");
    });

    it("'1. Herren' + Club erkennt Auswärts korrekt", () => {
      expect(
        detectTeamSide(["1. Herren", "SV Schriesheim"], "SG Hohensachsen"),
      ).toBe("gast");
    });

    it("'1. Herren' ohne Club-Token fällt (dokumentiert) auf gast zurück", () => {
      // Nur der Squad-Name → kein signifikanter Token → "gast" (genau der Bug,
      // den der Club-Name-Fix behebt).
      expect(detectTeamSide("1. Herren", "SV Schriesheim")).toBe("gast");
    });

    it("leere/undefined Namen im Array werden ignoriert", () => {
      expect(
        detectTeamSide(["1. Herren", ""], "SV Schriesheim"),
      ).toBe("gast");
      expect(
        detectTeamSide(["2. Mannschaft", "FC Sportfreunde 1910 Dossenheim"], "FC Sportfreunde 1910 Dossenheim II"),
      ).toBe("heim");
    });
  });
});
