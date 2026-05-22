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
});
