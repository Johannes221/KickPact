import { describe, it, expect } from "vitest";
import {
  isFullSeason,
  scopeKicker,
  scopeSuffix,
  bilanzHeadline,
  statsHeading
} from "@/lib/recap/aggregate-scope";

describe("aggregate-scope", () => {
  it("erkennt die volle Saison nur bei Tabellen-Quelle", () => {
    expect(isFullSeason("table")).toBe(true);
    expect(isFullSeason("matches")).toBe(false);
  });

  it("benennt bei Teilmengen die Basis statt eine Saison zu behaupten", () => {
    expect(scopeKicker("table", 34)).toBe("34 Spiele auf dem Platz");
    expect(scopeKicker("matches", 10)).toBe("10 ausgewertete Spiele");
    expect(scopeKicker("matches", 1)).toBe("1 ausgewertetes Spiel");
  });

  it("hängt den Bezug nur an, wo er nötig ist", () => {
    expect(scopeSuffix("table", 34)).toBe("");
    expect(scopeSuffix("matches", 10)).toBe(" in 10 ausgewerteten Spielen");
  });

  /** Kern der Regression: ohne Tabelle darf keine Saison behauptet werden. */
  it("behauptet ohne Tabelle keine Saison-Bilanz", () => {
    expect(bilanzHeadline("table")).toBe("Eure Bilanz");
    expect(bilanzHeadline("matches")).not.toMatch(/Saison/i);
    expect(bilanzHeadline("matches")).toBe("Eure Bilanz aus diesen Spielen");
  });

  it("nennt die Basis auch in der Block-Überschrift", () => {
    expect(statsHeading("table", 34)).toBe("Saison-Insights");
    expect(statsHeading("matches", 10)).toBe("Insights · 10 ausgewertete Spiele");
    expect(statsHeading("matches", 10)).not.toMatch(/Saison/i);
  });
});
