import { describe, it, expect } from "vitest";
import { isTriggerHit } from "@/lib/inngest/functions/evaluate-season";
import { normalizeTriggerParams } from "@/lib/validations/pledge";
import type { seasonResults } from "@/lib/db/schema";

type Result = typeof seasonResults.$inferSelect;

function makeResult(overrides: Partial<Result> = {}): Result {
  return {
    id: "r1",
    teamId: "t1",
    saison: "2025/26",
    finalPosition: null,
    teamsInLeague: null,
    promoted: false,
    relegated: false,
    cupRoundReached: null,
    customNotes: null,
    evaluatedAt: new Date(),
    ...overrides
  } as Result;
}

describe("evaluate-season isTriggerHit", () => {
  describe("season_promotion", () => {
    it("hit when promoted=true", () => {
      expect(isTriggerHit("season_promotion", {}, makeResult({ promoted: true }))).toBe(true);
    });
    it("miss when promoted=false", () => {
      expect(isTriggerHit("season_promotion", {}, makeResult({ promoted: false }))).toBe(false);
    });
  });

  describe("season_no_relegation", () => {
    it("hit when relegated=false (default)", () => {
      expect(isTriggerHit("season_no_relegation", {}, makeResult())).toBe(true);
    });
    it("miss when relegated=true", () => {
      expect(isTriggerHit("season_no_relegation", {}, makeResult({ relegated: true }))).toBe(false);
    });
  });

  describe("season_champion", () => {
    it("hit when finalPosition=1", () => {
      expect(isTriggerHit("season_champion", {}, makeResult({ finalPosition: 1 }))).toBe(true);
    });
    it("miss when finalPosition=2", () => {
      expect(isTriggerHit("season_champion", {}, makeResult({ finalPosition: 2 }))).toBe(false);
    });
    it("miss when finalPosition=null", () => {
      expect(isTriggerHit("season_champion", {}, makeResult())).toBe(false);
    });
  });

  describe("season_table_position", () => {
    it("hit when position is within [minPosition, maxPosition]", () => {
      expect(
        isTriggerHit(
          "season_table_position",
          { minPosition: 1, maxPosition: 5 },
          makeResult({ finalPosition: 3 })
        )
      ).toBe(true);
    });
    it("hit on lower boundary", () => {
      expect(
        isTriggerHit(
          "season_table_position",
          { minPosition: 1, maxPosition: 5 },
          makeResult({ finalPosition: 1 })
        )
      ).toBe(true);
    });
    it("hit on upper boundary", () => {
      expect(
        isTriggerHit(
          "season_table_position",
          { minPosition: 1, maxPosition: 5 },
          makeResult({ finalPosition: 5 })
        )
      ).toBe(true);
    });
    it("miss above range", () => {
      expect(
        isTriggerHit(
          "season_table_position",
          { minPosition: 1, maxPosition: 5 },
          makeResult({ finalPosition: 6 })
        )
      ).toBe(false);
    });
    it("miss when params missing", () => {
      expect(
        isTriggerHit("season_table_position", {}, makeResult({ finalPosition: 3 }))
      ).toBe(false);
    });
    it("miss when finalPosition is null", () => {
      expect(
        isTriggerHit(
          "season_table_position",
          { minPosition: 1, maxPosition: 5 },
          makeResult()
        )
      ).toBe(false);
    });
    it("accepts string number params", () => {
      expect(
        isTriggerHit(
          "season_table_position",
          { minPosition: "1", maxPosition: "5" },
          makeResult({ finalPosition: 3 })
        )
      ).toBe(true);
    });
  });

  describe("season_cup_round", () => {
    it("hit when reached >= minRound", () => {
      expect(
        isTriggerHit(
          "season_cup_round",
          { minRound: "halbfinale" },
          makeResult({ cupRoundReached: "finale" })
        )
      ).toBe(true);
    });
    it("hit when exactly minRound", () => {
      expect(
        isTriggerHit(
          "season_cup_round",
          { minRound: "halbfinale" },
          makeResult({ cupRoundReached: "halbfinale" })
        )
      ).toBe(true);
    });
    it("miss when reached < minRound", () => {
      expect(
        isTriggerHit(
          "season_cup_round",
          { minRound: "halbfinale" },
          makeResult({ cupRoundReached: "viertelfinale" })
        )
      ).toBe(false);
    });
    it("miss when cupRoundReached null", () => {
      expect(
        isTriggerHit("season_cup_round", { minRound: "halbfinale" }, makeResult())
      ).toBe(false);
    });
    it("case-insensitive", () => {
      expect(
        isTriggerHit(
          "season_cup_round",
          { minRound: "FINALE" },
          makeResult({ cupRoundReached: "Sieger" })
        )
      ).toBe(true);
    });
    it("feuert mit Wizard-Param (snake) nach Normalisierung", () => {
      // So kommt es aus dem Pact-Wizard: `min_round` → normalize → `minRound`.
      expect(
        isTriggerHit(
          "season_cup_round",
          normalizeTriggerParams({ min_round: "halbfinale" }),
          makeResult({ cupRoundReached: "finale" })
        )
      ).toBe(true);
    });
    it("Safety-Net: feuert auch mit NICHT-normalisiertem snake-Param", () => {
      expect(
        isTriggerHit(
          "season_cup_round",
          { min_round: "halbfinale" },
          makeResult({ cupRoundReached: "finale" })
        )
      ).toBe(true);
    });
    it("feuert NICHT ohne gewählte Runde (leere Params — der alte Bug)", () => {
      expect(
        isTriggerHit("season_cup_round", {}, makeResult({ cupRoundReached: "finale" }))
      ).toBe(false);
    });
  });

  describe("season_custom", () => {
    it("hit when customNotes is set (non-empty)", () => {
      expect(
        isTriggerHit("season_custom", {}, makeResult({ customNotes: "20 Tore mehr als letztes Jahr" }))
      ).toBe(true);
    });
    it("miss when customNotes is null", () => {
      expect(isTriggerHit("season_custom", {}, makeResult())).toBe(false);
    });
    it("miss when customNotes is empty string", () => {
      expect(isTriggerHit("season_custom", {}, makeResult({ customNotes: "" }))).toBe(false);
    });
  });
});
