import { describe, it, expect } from "vitest";
import { abbreviateTeamName, acronymTeamName } from "@/lib/utils/team-name";

describe("abbreviateTeamName", () => {
  it("behält Präfix + erstes signifikantes Wort, droppt Gründungsjahr", () => {
    expect(abbreviateTeamName("SV Friesland 08")).toBe("SV Friesland");
    expect(abbreviateTeamName("TuS Einheit Wilhelmshaven")).toBe("TuS Einheit");
    expect(abbreviateTeamName("SKV Rot-Weiß Wilhelmshaven")).toBe("SKV Rot-Weiß");
  });

  it("droppt führende Ordnungszahl wie „1.“", () => {
    expect(abbreviateTeamName("1. FC Köln")).toBe("FC Köln");
  });

  it("entfernt Rechtsform-Suffixe", () => {
    expect(abbreviateTeamName("FC Beispiel e.V.")).toBe("FC Beispiel");
  });

  it("überspringt römisches Mannschafts-Suffix als zweites Token", () => {
    expect(abbreviateTeamName("SV II Reserve")).toBe("SV Reserve");
  });

  it("gibt Ein-Wort-Namen unverändert zurück", () => {
    expect(abbreviateTeamName("Türkgücü")).toBe("Türkgücü");
  });

  it("ist robust gegen leere Eingabe", () => {
    expect(abbreviateTeamName("")).toBe("");
  });
});

describe("acronymTeamName", () => {
  it("erzeugt Scoreboard-Kürzel: Präfix-Block + Initialen", () => {
    expect(acronymTeamName("SV Schwetzingen")).toBe("SVS");
    expect(acronymTeamName("FC Sportfreunde Dossenheim")).toBe("FCSD");
    expect(acronymTeamName("Heidelberger SC")).toBe("HSC");
    expect(acronymTeamName("FG Union Heidelberg")).toBe("FGUH");
  });

  it("droppt Gründungsjahr + führende Ordnungszahl", () => {
    expect(acronymTeamName("FC Sportfreunde 1910 Dossenheim")).toBe("FCSD");
    expect(acronymTeamName("1. FC Köln")).toBe("FCK");
  });

  it("entfernt Rechtsform-Suffixe vor dem Kürzeln", () => {
    expect(acronymTeamName("FC Beispiel e.V.")).toBe("FCB");
  });

  it("begrenzt sehr lange Ketten auf 6 Zeichen", () => {
    expect(acronymTeamName("SV Eintracht Frohe Zukunft Magdeburg Reserve").length)
      .toBeLessThanOrEqual(6);
  });

  it("gibt bei Einzelwort ein kompaktes Kürzel zurück", () => {
    expect(acronymTeamName("Türkgücü")).toBe("Türk");
    expect(acronymTeamName("FCB")).toBe("FCB");
  });

  it("ist robust gegen leere Eingabe", () => {
    expect(acronymTeamName("")).toBe("");
  });
});
