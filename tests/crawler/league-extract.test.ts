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

  // ── Live-Format 2026-07-17: die Altersklasse fehlt, die Liga klebt an der
  //    Uhrzeit im selben Segment. Verifiziert an Herren UND Jugend:
  //      "So, 31.05.26 | 17:00 Landesliga ME | 320179298"
  //      "Fr, 08.05.26 | 19:00 Kreisliga ME | 320421040"
  //    Der Uhrzeit-Guard verwarf das komplett → teams.league blieb leer, und die
  //    alten "Sa"/"So"-Werte standen für immer (updateTeamLeague überschreibt
  //    nie mit leer). Ergebnis: 6 von 6 Teams ohne korrekte Liga.
  it("löst die an der Uhrzeit klebende Liga (aktuelles Live-Format)", () => {
    expect(
      extractLeagueFromCompetitionText("So, 31.05.26 | 17:00 Landesliga ME | 320179298")
    ).toBe("Landesliga ME");
    expect(
      extractLeagueFromCompetitionText("Fr, 08.05.26 | 19:00 Kreisliga ME | 320421040")
    ).toBe("Kreisliga ME");
    expect(
      extractLeagueFromCompetitionText("Sa, 30.05.26 | 15:00 Kreisklasse B ME | 320200233")
    ).toBe("Kreisklasse B ME");
  });

  /**
   * Bleibt gültig: steht nach der Uhrzeit nur die ALTERSKLASSE, ist in diesem
   * Segment keine Liga — sonst hieße die Liga von Dossenheim „Herren".
   */
  it("hält Altersklassen weiterhin für keine Liga", () => {
    expect(extractLeagueFromCompetitionText("Sa, 23.05.26 | 14:00 Herren | 320198230")).toBeNull();
    expect(extractLeagueFromCompetitionText("Sa, 23.05.26 | 14:00 C-Junioren | 390013130")).toBeNull();
    expect(extractLeagueFromCompetitionText("So, 24.05.26 | 11:00 Frauen | 320104178")).toBeNull();
  });
});
