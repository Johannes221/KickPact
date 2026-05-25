import { describe, expect, it } from "vitest";
import {
  categorize,
  getCategoryLabel,
  TRIGGER_TYPES_BY_CATEGORY
} from "@/lib/billing/trigger-categories";

describe("categorize", () => {
  it("Auto-Trigger: goal_total / win / clean_sheet / comeback_win / hattrick", () => {
    expect(categorize("goal_total")).toBe("auto");
    expect(categorize("win")).toBe("auto");
    expect(categorize("clean_sheet")).toBe("auto");
    expect(categorize("comeback_win")).toBe("auto");
    expect(categorize("hattrick")).toBe("auto");
    expect(categorize("draw")).toBe("auto");
    expect(categorize("loss")).toBe("auto");
    expect(categorize("goal_by_player")).toBe("auto");
    expect(categorize("goal_diff_min")).toBe("auto");
    expect(categorize("goals_scored_min")).toBe("auto");
  });

  it("Manual-Trigger: special_goal / yellow_card / red_card / assist / man_of_match / custom", () => {
    expect(categorize("special_goal")).toBe("manual");
    expect(categorize("yellow_card")).toBe("manual");
    expect(categorize("red_card")).toBe("manual");
    expect(categorize("assist")).toBe("manual");
    expect(categorize("man_of_match")).toBe("manual");
    expect(categorize("custom")).toBe("manual");
  });

  it("Season-Trigger: season_promotion / season_no_relegation / season_table_position / season_champion / season_cup_round / season_custom", () => {
    expect(categorize("season_promotion")).toBe("season");
    expect(categorize("season_no_relegation")).toBe("season");
    expect(categorize("season_table_position")).toBe("season");
    expect(categorize("season_champion")).toBe("season");
    expect(categorize("season_cup_round")).toBe("season");
    expect(categorize("season_custom")).toBe("season");
  });

  it("Unbekannte Trigger fallen auf 'auto' zurück (sicherer Fallback)", () => {
    expect(categorize("__totally_unknown__")).toBe("auto");
  });
});

describe("getCategoryLabel", () => {
  it("liefert lesbare deutsche Labels", () => {
    expect(getCategoryLabel("auto")).toBe("Auto-Trigger");
    expect(getCategoryLabel("manual")).toBe("Manuelle Trigger");
    expect(getCategoryLabel("season")).toBe("Saison-Wetten");
  });
});

describe("TRIGGER_TYPES_BY_CATEGORY", () => {
  it("jeder gelistete Trigger ist seiner Kategorie zugeordnet", () => {
    for (const [cat, types] of Object.entries(TRIGGER_TYPES_BY_CATEGORY)) {
      for (const t of types) {
        expect(categorize(t)).toBe(cat);
      }
    }
  });

  it("die drei Kategorien haben keine Doppel-Einträge zwischen sich", () => {
    const all = [
      ...TRIGGER_TYPES_BY_CATEGORY.auto,
      ...TRIGGER_TYPES_BY_CATEGORY.manual,
      ...TRIGGER_TYPES_BY_CATEGORY.season
    ];
    const unique = new Set(all);
    expect(unique.size).toBe(all.length);
  });
});
