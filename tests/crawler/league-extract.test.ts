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

  // ── Aktuelles fussball.de-Format: pipe-getrennt, Liga vor der Wettbewerb-ID ──
  // Regression für Bug 2026-06-03: split(",")[0] lieferte den Wochentag ("So").
  it("nimmt die Liga aus dem Pipe-Format (vor der Wettbewerb-ID), NICHT den Wochentag", () => {
    expect(
      extractLeagueFromCompetitionText("Sa, 23.05.26 | 14:00 C-Junioren | Oberliga ME | 390013130")
    ).toBe("Oberliga ME");
    expect(
      extractLeagueFromCompetitionText("So, 31.05.26 | 11:00 Herren | Kreisklasse B ME | 320104178")
    ).toBe("Kreisklasse B ME");
  });

  it("funktioniert auch ohne führenden Wochentag/Datum (Folgespiel am selben Tag)", () => {
    expect(
      extractLeagueFromCompetitionText("15:00 Herren | Kreisliga ME | 320198230")
    ).toBe("Kreisliga ME");
  });

  it("nimmt das letzte Segment, wenn keine numerische Wettbewerb-ID folgt", () => {
    expect(
      extractLeagueFromCompetitionText("So, 24.05.26 | 14:00 Herren | Landesliga ME")
    ).toBe("Landesliga ME");
  });

  it("gibt null zurück, wenn statt einer Liga nur Uhrzeit/Altersklasse vor der ID steht", () => {
    expect(
      extractLeagueFromCompetitionText("Sa, 23.05.26 | 14:00 Herren | 320198230")
    ).toBeNull();
  });

  it("gibt null für eine reine Datums-/Wochentags-Zeile ohne Liga zurück", () => {
    expect(extractLeagueFromCompetitionText("So, 01.06.25")).toBeNull();
  });
});
