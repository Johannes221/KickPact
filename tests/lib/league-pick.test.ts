import { describe, it, expect } from "vitest";
import {
  pickTeamLeague,
  parseCompetition,
  competitionTypeOf,
  isAgeGroup,
  stripLeadingTime,
  isPlausibleLeague
} from "@/lib/utils/league";

describe("parseCompetition", () => {
  it("trennt Name und Typ am fussball.de-Marker", () => {
    expect(parseCompetition("Landesliga ME")).toEqual({ name: "Landesliga", type: "league" });
    expect(parseCompetition("Kreisfreundschaftsspiele FS")).toEqual({
      name: "Kreisfreundschaftsspiele",
      type: "friendly"
    });
    expect(parseCompetition("Verbandspokal PO")).toEqual({ name: "Verbandspokal", type: "cup" });
    expect(parseCompetition("Kreisklasse B ME")).toEqual({ name: "Kreisklasse B", type: "league" });
  });

  it("lässt Werte ohne bekannten Marker unangetastet", () => {
    expect(parseCompetition("Landesliga")).toEqual({ name: "Landesliga", type: "unknown" });
    expect(parseCompetition("")).toEqual({ name: "", type: "unknown" });
  });

  /**
   * Regression: `TU` (Vereinsturnier) kommt in den echten Fixtures 4× vor und
   * fiel als "unknown" durch — womit ein Vereinsturnier Charges erzeugt hätte.
   * Der Entscheid lautet „Geld nur auf Liga + Pokal"; ein Turnier ist beides
   * nicht. Solange die Menge der bekannten Nicht-ME/PO-Marker vollständig ist,
   * sind „alles außer FS zahlt" und „nur Liga+Pokal zahlt" deckungsgleich — TU
   * hat bewiesen, dass sie es nicht war.
   */
  it("behandelt ein Vereinsturnier nicht als zahlungspflichtigen Wettbewerb", () => {
    expect(parseCompetition("Vereinsturnier TU")).toEqual({
      name: "Vereinsturnier",
      type: "friendly"
    });
    expect(competitionTypeOf("Vereinsturnier TU")).toBe("friendly");
  });

  it("rät bei unbekanntem Marker nicht, sondern sagt unknown", () => {
    expect(competitionTypeOf("Irgendwas XY")).toBe("unknown");
    expect(competitionTypeOf(null)).toBe("unknown");
  });
});

describe("pickTeamLeague", () => {
  /**
   * Live-Fall Dossenheim (2026-07-17): prev.games liefert das jüngste Spiel
   * zuerst, im Juli also ein Freundschaftsspiel. „Erster Treffer gewinnt" hätte
   * „Kreisfreundschaftsspiele" als Liga gesetzt.
   */
  it("ignoriert Freundschafts- und Pokalspiele", () => {
    const values = [
      "Kreisfreundschaftsspiele FS",
      "Verbandspokal PO",
      ...Array(10).fill("Landesliga ME")
    ];
    expect(pickTeamLeague(values)).toBe("Landesliga");
  });

  /**
   * Live-Fall B-Junioren (2026-07-17): im Juli waren AUSSCHLIESSLICH
   * Freundschaftsspiele gescrapt. Reine Mehrheitswahl hätte daraus die Liga
   * „Kreisfreundschaftsspiele" gemacht — keine Liga ist ehrlicher.
   */
  it("liefert null, wenn nur Freundschaftsspiele vorliegen", () => {
    expect(pickTeamLeague(["Kreisfreundschaftsspiele FS", "Kreisfreundschaftsspiele FS"])).toBeNull();
  });

  it("nimmt bei mehreren Ligen die häufigste", () => {
    expect(
      pickTeamLeague(["Kreisliga ME", "Landesliga ME", "Landesliga ME"])
    ).toBe("Landesliga");
  });

  it("ignoriert implausible Werte (Wochentag, Uhrzeit, ID, Altersklasse)", () => {
    expect(pickTeamLeague(["So", "14:00", "320179298", "Herren ME", "Kreisliga ME"])).toBe(
      "Kreisliga"
    );
  });

  it("liefert null, wenn nichts Plausibles dabei ist", () => {
    expect(pickTeamLeague(["So", "Sa", null, undefined, ""])).toBeNull();
    expect(pickTeamLeague([])).toBeNull();
  });

  it("ist bei Gleichstand stabil (erster gesehener Wert)", () => {
    expect(pickTeamLeague(["Kreisliga ME", "Kreisklasse A ME"])).toBe("Kreisliga");
  });
});

describe("stripLeadingTime", () => {
  it("löst die Liga von der Uhrzeit", () => {
    expect(stripLeadingTime("19:00 Kreisliga ME")).toBe("Kreisliga ME");
    expect(stripLeadingTime("9.30 Kreisliga")).toBe("Kreisliga");
    expect(stripLeadingTime("19:00 Uhr Kreisliga")).toBe("Kreisliga");
  });

  it("lässt Werte ohne führende Uhrzeit unberührt", () => {
    expect(stripLeadingTime("Landesliga ME")).toBe("Landesliga ME");
  });
});

describe("isAgeGroup", () => {
  it("erkennt Altersklassen", () => {
    for (const v of ["Herren", "Frauen", "C-Junioren", "B-Juniorinnen", "Senioren", "Alte Herren"]) {
      expect(isAgeGroup(v), v).toBe(true);
      expect(isPlausibleLeague(v), v).toBe(false);
    }
  });

  it("hält echte Ligen NICHT für Altersklassen", () => {
    for (const v of ["Landesliga ME", "Kreisliga ME", "Kreisklasse B ME", "Oberliga ME"]) {
      expect(isAgeGroup(v), v).toBe(false);
      expect(isPlausibleLeague(v), v).toBe(true);
    }
  });
});
