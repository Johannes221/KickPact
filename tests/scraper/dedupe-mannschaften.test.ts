import { describe, it, expect } from "vitest";
import {
  dedupeMannschaften,
  normalizeTeamName,
  type MannschaftHit,
} from "../../lib/crawler/fussballde";
import { loadFixtureJson } from "../setup/playwright-mocks";

describe("normalizeTeamName", () => {
  it("entfernt Zero-Width-Spaces aus SG-Namen", () => {
    const raw = "A-Junioren - JSG Dossenheim/​Handschuhsheim/​ Wieblingen";
    expect(normalizeTeamName(raw)).toBe(
      "A-Junioren - JSG Dossenheim/Handschuhsheim/ Wieblingen",
    );
  });

  it("kollabiert geschützte Leerzeichen und Whitespace", () => {
    expect(normalizeTeamName("Herren -  FC   Test\n")).toBe(
      "Herren - FC Test",
    );
  });
});

describe("dedupeMannschaften", () => {
  it("faltet die fussball.de-Doppel des Dossenheim-Vereins zusammen", async () => {
    const raw = await loadFixtureJson<MannschaftHit[]>(
      "dossenheim/mannschaften.json",
    );
    const deduped = dedupeMannschaften(raw);

    // 27 Roh-Einträge → 15 eindeutige Mannschaften.
    expect(raw.length).toBe(27);
    expect(deduped.length).toBe(15);

    const categoryCount = (cat: string) =>
      deduped.filter((m) => m.name.startsWith(cat)).length;

    // Herren 1/2/3 bleiben getrennt (verschiedene Nummern, nie zusammengefaltet).
    expect(categoryCount("Herren")).toBe(3);
    // Jede Jugendkategorie behält genau ihre 1er- und 2er-Mannschaft.
    for (const cat of ["A-Junioren", "B-Junioren", "C-Junioren", "D-Junioren", "E-Junioren", "F-Junioren"]) {
      expect(categoryCount(cat)).toBe(2);
    }
  });

  it("faltet E-Junioren-Schreibvarianten trotz unterschiedlichem Slug zusammen", () => {
    const variants: MannschaftHit[] = [
      {
        name: "E-Junioren - FC Dossenheim",
        slug: "fc-dossenheim-fc-sportfr-dossenheim-baden",
        saison: "2526",
        teamId: "OLD",
        url: "",
      },
      {
        name: "E-Junioren - FC Sportfr. Dossenheim",
        slug: "fc-sportfr-dossenheim-fc-sportfr-dossenheim-baden",
        saison: "2526",
        teamId: "NEW",
        url: "",
      },
    ];
    const deduped = dedupeMannschaften(variants);
    expect(deduped.length).toBe(1);
  });

  it("trennt 1. und 2. Mannschaft derselben Kategorie", () => {
    const teams: MannschaftHit[] = [
      { name: "E-Junioren - FC Dossenheim", slug: "fc-dossenheim", saison: "2526", teamId: "A", url: "" },
      { name: "E-Junioren - FC Dossenheim 2", slug: "fc-dossenheim-2", saison: "2526", teamId: "B", url: "" },
    ];
    expect(dedupeMannschaften(teams).length).toBe(2);
  });

  it("faltet fremde Spielgemeinschaften ohne gemeinsames Kernwort NICHT zusammen", () => {
    const teams: MannschaftHit[] = [
      { name: "Herren - SV Altdorf", slug: "sv-altdorf", saison: "2526", teamId: "A", url: "" },
      { name: "Herren - TSV Neustadt", slug: "tsv-neustadt", saison: "2526", teamId: "B", url: "" },
    ];
    expect(dedupeMannschaften(teams).length).toBe(2);
  });

  it("behält bei Kollision den per Komparator bevorzugten Eintrag", () => {
    const teams = [
      { name: "E-Junioren - FC Dossenheim", slug: "fc-dossenheim", saison: "2526", teamId: "OLD", registered: false },
      { name: "E-Junioren - FC Sportfr. Dossenheim", slug: "fc-sportfr-dossenheim", saison: "2526", teamId: "NEW", registered: true },
    ];
    const deduped = dedupeMannschaften(teams, (inc, cur) => inc.registered && !cur.registered);
    expect(deduped.length).toBe(1);
    expect(deduped[0].teamId).toBe("NEW");
  });
});
