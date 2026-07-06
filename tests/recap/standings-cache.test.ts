/**
 * Read-Through-Verhalten von getCachedStandings:
 *  - frische DB-Zeile → sofort zurück, KEIN Browser-Scrape
 *  - Cache-Miss → genau einmal scrapen + persistieren, Ergebnis zurück
 *  - Scrape scheitert, aber (veraltete) DB-Zeile da → die zurückgeben statt null
 * DB-Lookup + Scrape + Persist sind gemockt; getestet wird die Orchestrierung.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeagueStandings } from "@/lib/crawler/fussballde";

const { getStoredMock, storeMock, scrapeMock, teamRowMock } = vi.hoisted(() => ({
  getStoredMock: vi.fn(),
  storeMock: vi.fn(),
  scrapeMock: vi.fn(),
  teamRowMock: vi.fn()
}));

vi.mock("@/lib/db/queries/standings", () => ({
  getStoredStandings: getStoredMock,
  storeStandings: storeMock
}));
vi.mock("@/lib/crawler/fussballde", () => ({ getLeagueStandings: scrapeMock }));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => teamRowMock() })
        })
      })
    })
  }
}));

import { getCachedStandings } from "@/lib/recap/standings-cache";

const STANDINGS: LeagueStandings = {
  teamsInLeague: 14,
  rows: [
    {
      position: 6,
      teamName: "FG Union",
      spiele: 24,
      siege: 12,
      unentschieden: 6,
      niederlagen: 6,
      toreFor: 76,
      toreAgainst: 45,
      punkte: 42
    }
  ],
  ownRow: {
    position: 6,
    teamName: "FG Union",
    spiele: 24,
    siege: 12,
    unentschieden: 6,
    niederlagen: 6,
    toreFor: 76,
    toreAgainst: 45,
    punkte: 42
  },
  // Modern geformte Zeile: topScorers ist gesetzt (mind. []) → nicht upgrade-pflichtig.
  topScorers: [],
  ownTopScorers: [],
  fairnessOwnRow: null
};

// Alt-Zeile aus der Zeit vor den Liga-Extras: topScorers fehlt komplett.
const LEGACY_STANDINGS = {
  teamsInLeague: STANDINGS.teamsInLeague,
  rows: STANDINGS.rows,
  ownRow: STANDINGS.ownRow
} as LeagueStandings;

describe("getCachedStandings (read-through)", () => {
  beforeEach(() => {
    getStoredMock.mockReset();
    storeMock.mockReset().mockResolvedValue(undefined);
    scrapeMock.mockReset();
    teamRowMock.mockReset().mockReturnValue([
      { fid: "12345", slug: "fg-union", clubName: "FG Union" }
    ]);
  });

  it("frische DB-Zeile → zurück ohne Scrape", async () => {
    getStoredMock.mockResolvedValue({ data: STANDINGS, scrapedAt: new Date() });
    const res = await getCachedStandings("t1", "2425");
    expect(res).toBe(STANDINGS);
    expect(scrapeMock).not.toHaveBeenCalled();
    expect(storeMock).not.toHaveBeenCalled();
  });

  it("Cache-Miss → scrapen + persistieren", async () => {
    getStoredMock.mockResolvedValue(null);
    scrapeMock.mockResolvedValue(STANDINGS);
    const res = await getCachedStandings("t1", "2425");
    expect(res).toBe(STANDINGS);
    expect(scrapeMock).toHaveBeenCalledOnce();
    expect(storeMock).toHaveBeenCalledWith("t1", "2425", STANDINGS);
  });

  it("Alt-Zeile ohne Liga-Extras → einmal nachscrapen (Upgrade)", async () => {
    // frisch geschrieben, aber pre-Feature-Form (kein topScorers) → nachscrapen.
    getStoredMock.mockResolvedValue({ data: LEGACY_STANDINGS, scrapedAt: new Date() });
    scrapeMock.mockResolvedValue(STANDINGS);
    const res = await getCachedStandings("t1", "2425");
    expect(res).toBe(STANDINGS);
    expect(scrapeMock).toHaveBeenCalledOnce();
    expect(storeMock).toHaveBeenCalledWith("t1", "2425", STANDINGS);
  });

  it("Scrape scheitert, aber veraltete DB-Zeile da → veraltete zurück", async () => {
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 Tage alt
    getStoredMock.mockResolvedValue({ data: STANDINGS, scrapedAt: old });
    scrapeMock.mockResolvedValue(null);
    const res = await getCachedStandings("t1", "2425");
    expect(res).toBe(STANDINGS);
    expect(scrapeMock).toHaveBeenCalledOnce();
    expect(storeMock).not.toHaveBeenCalled();
  });
});
