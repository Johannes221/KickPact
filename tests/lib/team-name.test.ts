import { describe, it, expect } from "vitest";
import { abbreviateTeamName } from "@/lib/utils/team-name";

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
