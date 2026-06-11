import { describe, it, expect } from "vitest";
import {
  ageClassFromTeamName,
  coverageFloorFromAgeClass,
  coverageFloorFromTeamName,
  combineCoverage,
  requiresNamedScorers,
  coverageAllowsTrigger,
  applyCoverageApprovalPolicy
} from "@/lib/triggers/coverage";
import { classifyScrapedMatches } from "@/lib/crawler/coverage";

describe("ageClassFromTeamName", () => {
  const cases: Array<[string, ReturnType<typeof ageClassFromTeamName>]> = [
    ["Herren - SV Waldhof Mannheim", "herren"],
    ["Herren - SV Waldhof Mannheim 2", "herren"],
    ["A-Junioren - SV Sandhausen", "A"],
    ["B-Juniorinnen - Karlsruher SC", "B"],
    ["C-Junioren - VfR Mannheim", "C"],
    ["D-Junioren - Karlsruher SC U13", "D"],
    ["E-Junioren - SV Sandhausen", "E"],
    ["F-Junioren - TSV Amicitia Viernheim", "F"],
    ["G-Junioren - SV Sandhausen", "G"],
    ["Bambini - FV Brühl", "G"],
    ["Frauen - Karlsruher SC", "frauen"],
    ["Herren Ü40 - SV Harmonia", "alte_herren"]
  ];
  for (const [name, expected] of cases) {
    it(`"${name}" → ${expected}`, () => {
      expect(ageClassFromTeamName(name)).toBe(expected);
    });
  }
});

describe("coverageFloorFromAgeClass", () => {
  it("Herren/Frauen/A/B → full", () => {
    for (const a of ["herren", "frauen", "alte_herren", "A", "B"] as const) {
      expect(coverageFloorFromAgeClass(a)).toBe("full");
    }
  });
  it("C/D → results_only", () => {
    expect(coverageFloorFromAgeClass("C")).toBe("results_only");
    expect(coverageFloorFromAgeClass("D")).toBe("results_only");
  });
  it("E/F/G → none", () => {
    for (const a of ["E", "F", "G"] as const) {
      expect(coverageFloorFromAgeClass(a)).toBe("none");
    }
  });
  it("unbekannt → full (nicht voreilig ausblenden)", () => {
    expect(coverageFloorFromAgeClass("unbekannt")).toBe("full");
  });
});

describe("coverageFloorFromTeamName (Onboarding-Filter)", () => {
  it("blendet E-/F-/G-Jugend aus (none)", () => {
    expect(coverageFloorFromTeamName("E-Junioren - SV Sandhausen")).toBe("none");
    expect(coverageFloorFromTeamName("F-Junioren - FV Brühl")).toBe("none");
  });
  it("Herren/A/B bleiben sichtbar (full)", () => {
    expect(coverageFloorFromTeamName("Herren - VfR Mannheim")).toBe("full");
    expect(coverageFloorFromTeamName("A-Junioren - KSC")).toBe("full");
  });
});

describe("combineCoverage", () => {
  it("nimmt die höhere Stufe", () => {
    expect(combineCoverage("none", "results_only")).toBe("results_only");
    expect(combineCoverage("results_only", "full")).toBe("full");
    expect(combineCoverage("full", "none")).toBe("full");
    expect(combineCoverage("none", "none")).toBe("none");
  });
});

describe("requiresNamedScorers", () => {
  it("nur goal_by_player + hattrick", () => {
    expect(requiresNamedScorers("goal_by_player")).toBe(true);
    expect(requiresNamedScorers("hattrick")).toBe(true);
    expect(requiresNamedScorers("goal_total")).toBe(false);
    expect(requiresNamedScorers("win")).toBe(false);
    expect(requiresNamedScorers("special_goal")).toBe(false);
    expect(requiresNamedScorers("season_promotion")).toBe(false);
  });
});

describe("coverageAllowsTrigger", () => {
  it("null (unklassifiziert) → alles erlaubt (Grandfather)", () => {
    expect(coverageAllowsTrigger(null, "goal_by_player")).toBe(true);
    expect(coverageAllowsTrigger(undefined, "hattrick")).toBe(true);
  });
  it("full → alles erlaubt", () => {
    expect(coverageAllowsTrigger("full", "goal_by_player")).toBe(true);
    expect(coverageAllowsTrigger("full", "win")).toBe(true);
  });
  it("results_only → Spieler-Wetten blocken, Rest erlaubt", () => {
    expect(coverageAllowsTrigger("results_only", "goal_by_player")).toBe(false);
    expect(coverageAllowsTrigger("results_only", "hattrick")).toBe(false);
    expect(coverageAllowsTrigger("results_only", "goal_total")).toBe(true);
    expect(coverageAllowsTrigger("results_only", "win")).toBe(true);
    expect(coverageAllowsTrigger("results_only", "comeback_win")).toBe(true);
    expect(coverageAllowsTrigger("results_only", "season_promotion")).toBe(true);
    expect(coverageAllowsTrigger("results_only", "special_goal")).toBe(true);
  });
  it("none → wie results_only: manuell meldbare Trigger erlaubt, Auto-Spieler-Trigger nicht", () => {
    // Audit 2026-06-11 / Phase 4 B1a-Folge: none-Teams (E-Jugend etc.) sind
    // jetzt onboardbar — der Verein meldet Spiele/Ereignisse manuell (inkl.
    // Endstand via Result-Override), Sponsoren bestätigen. Ein Komplett-Block
    // würde jede Pact-Erstellung verhindern (toter Zustand).
    expect(coverageAllowsTrigger("none", "goal_total")).toBe(true);
    expect(coverageAllowsTrigger("none", "win")).toBe(true);
    expect(coverageAllowsTrigger("none", "special_goal")).toBe(true);
    expect(coverageAllowsTrigger("none", "season_promotion")).toBe(true);
    expect(coverageAllowsTrigger("none", "goal_by_player")).toBe(false);
    expect(coverageAllowsTrigger("none", "hattrick")).toBe(false);
  });
});

describe("applyCoverageApprovalPolicy", () => {
  const proposals = [
    { id: "a", requiresApproval: false },
    { id: "b", requiresApproval: true }
  ];
  it("none → alles approval-pflichtig (Verein bestätigt sich nicht selbst)", () => {
    const out = applyCoverageApprovalPolicy(proposals, "none");
    expect(out.every((p) => p.requiresApproval)).toBe(true);
  });
  it("full/results_only/null → unverändert", () => {
    for (const cov of ["full", "results_only", null] as const) {
      const out = applyCoverageApprovalPolicy(proposals, cov);
      expect(out[0].requiresApproval).toBe(false);
      expect(out[1].requiresApproval).toBe(true);
    }
  });
});

describe("classifyScrapedMatches", () => {
  const ev = (named: boolean) => ({
    typ: "TOR" as const,
    minute: 10,
    side: "heim" as const,
    ...(named ? { spielerId: "P1", spielerName: "Müller" } : {})
  });

  it("benannter Torschütze in irgendeinem Spiel → full", () => {
    expect(
      classifyScrapedMatches([
        { events: [] },
        { events: [ev(false)] },
        { events: [ev(true)] }
      ])
    ).toBe("full");
  });

  it("Spiele vorhanden, aber keine benannten Torschützen → results_only", () => {
    expect(
      classifyScrapedMatches([{ events: [] }, { events: [ev(false)] }])
    ).toBe("results_only");
  });

  it("keine Spiele → none", () => {
    expect(classifyScrapedMatches([])).toBe("none");
  });
});
