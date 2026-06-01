import { describe, it, expect } from "vitest";
import { extractLeagueFromCompetitionText } from "@/lib/crawler/fussballde";

describe("extractLeagueFromCompetitionText", () => {
  it("takes the text before the first comma", () => {
    expect(
      extractLeagueFromCompetitionText("Kreisliga A, Staffel 3, Herren")
    ).toBe("Kreisliga A");
  });

  it("trims surrounding whitespace", () => {
    expect(
      extractLeagueFromCompetitionText("  Bezirksliga Nord  , Gruppe 1")
    ).toBe("Bezirksliga Nord");
  });

  it("returns the whole string when there is no comma", () => {
    expect(extractLeagueFromCompetitionText("Landesliga")).toBe("Landesliga");
  });

  it("normalises internal whitespace via trimming the segment", () => {
    expect(extractLeagueFromCompetitionText("Oberliga Mitte , X")).toBe(
      "Oberliga Mitte"
    );
  });

  it("returns null for an empty string", () => {
    expect(extractLeagueFromCompetitionText("")).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    expect(extractLeagueFromCompetitionText("   ")).toBeNull();
  });

  it("returns null when the segment before the comma is empty", () => {
    expect(extractLeagueFromCompetitionText("  , Staffel 2")).toBeNull();
  });
});
