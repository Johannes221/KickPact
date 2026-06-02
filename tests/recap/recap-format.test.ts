import { describe, expect, it } from "vitest";
import { eurWhole, triggerLabel, seasonLabel } from "@/lib/recap/recap-format";

describe("eurWhole", () => {
  it("rundet auf ganze Euro mit Tausender-Punkt", () => {
    expect(eurWhole(123456)).toBe("1.235 €");
    expect(eurWhole(0)).toBe("0 €");
    expect(eurWhole(4999)).toBe("50 €");
  });
});

describe("triggerLabel", () => {
  it("mappt bekannte Trigger auf deutsche Labels", () => {
    expect(triggerLabel("goal_total")).toBe("Tore");
    expect(triggerLabel("win")).toBe("Siege");
    expect(triggerLabel("clean_sheet")).toBe("Zu-Null-Spiele");
  });

  it("fällt für unbekannte Trigger auf entkapseltes Token zurück", () => {
    expect(triggerLabel("bizeps_tor")).toBe("bizeps tor");
  });
});

describe("seasonLabel", () => {
  it("formatiert verschiedene Saison-Codes", () => {
    expect(seasonLabel("2025/26")).toBe("Saison 25/26");
    expect(seasonLabel("2526")).toBe("Saison 25/26");
    expect(seasonLabel("2025/2026")).toBe("Saison 25/26");
  });

  it("fällt sauber zurück", () => {
    expect(seasonLabel(null)).toBe("Saison");
    expect(seasonLabel(undefined)).toBe("Saison");
    expect(seasonLabel("Sommer")).toBe("Saison Sommer");
  });
});
