import { describe, expect, it } from "vitest";
import {
  WagerWindowClosedError,
  assertWagerWindowOpen,
  canBookSeasonPassPure,
  canCreateSeasonWagerPure,
  type SeasonWindow
} from "@/lib/billing/wager-window";

const SAISON_2627: SeasonWindow = {
  id: "season-2627",
  code: "2627",
  matchdayFiveAt: new Date("2026-09-15T23:59:59Z")
};

describe("canBookSeasonPassPure", () => {
  it("true für today vor Cutoff (Frühbucher Juni)", () => {
    expect(
      canBookSeasonPassPure(SAISON_2627, new Date("2026-06-15T12:00:00Z"))
    ).toBe(true);
  });

  it("true für today innerhalb erster Spieltage (15.8.)", () => {
    expect(
      canBookSeasonPassPure(SAISON_2627, new Date("2026-08-15T12:00:00Z"))
    ).toBe(true);
  });

  it("false für today nach Matchday 5 (20.9.)", () => {
    expect(
      canBookSeasonPassPure(SAISON_2627, new Date("2026-09-20T12:00:00Z"))
    ).toBe(false);
  });

  it("inclusive an matchdayFiveAt", () => {
    expect(
      canBookSeasonPassPure(SAISON_2627, new Date("2026-09-15T23:59:59Z"))
    ).toBe(true);
  });

  it("1 ms nach matchdayFiveAt → false", () => {
    expect(
      canBookSeasonPassPure(SAISON_2627, new Date("2026-09-16T00:00:00.000Z"))
    ).toBe(false);
  });

  it("keine aktive Saison → false", () => {
    expect(
      canBookSeasonPassPure(null, new Date("2026-08-01T00:00:00Z"))
    ).toBe(false);
  });
});

describe("canCreateSeasonWagerPure", () => {
  it("Frühbucher-Phase (Juni) → erlaubt", () => {
    expect(
      canCreateSeasonWagerPure(SAISON_2627, new Date("2026-06-15T12:00:00Z"))
    ).toBe(true);
  });

  it("nach Matchday 5 → nicht mehr erlaubt", () => {
    expect(
      canCreateSeasonWagerPure(SAISON_2627, new Date("2026-10-01T12:00:00Z"))
    ).toBe(false);
  });

  it("keine aktive Saison → false", () => {
    expect(
      canCreateSeasonWagerPure(null, new Date("2026-08-01T00:00:00Z"))
    ).toBe(false);
  });
});

describe("assertWagerWindowOpen", () => {
  it("wirft WagerWindowClosedError, wenn keine Saison aktiv", () => {
    expect(() =>
      assertWagerWindowOpen(null, new Date("2026-10-01T00:00:00Z"))
    ).toThrow(WagerWindowClosedError);
  });

  it("wirft WagerWindowClosedError nach Cutoff", () => {
    expect(() =>
      assertWagerWindowOpen(SAISON_2627, new Date("2026-10-01T00:00:00Z"))
    ).toThrow(WagerWindowClosedError);
  });

  it("kein Throw vor Cutoff", () => {
    expect(() =>
      assertWagerWindowOpen(SAISON_2627, new Date("2026-08-15T00:00:00Z"))
    ).not.toThrow();
  });

  it("Error enthält seasonCode + cutoffAt", () => {
    try {
      assertWagerWindowOpen(SAISON_2627, new Date("2026-10-01T00:00:00Z"));
    } catch (e) {
      const err = e as WagerWindowClosedError;
      expect(err.seasonCode).toBe("2627");
      expect(err.cutoffAt?.toISOString()).toBe("2026-09-15T23:59:59.000Z");
      return;
    }
    throw new Error("Expected throw");
  });
});
