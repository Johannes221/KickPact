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
import { currentSaisonCode } from "@/lib/utils/saison";

const UNION_ROW = {
  position: 6,
  teamName: "FG Union",
  teamId: "011MIEDJ70000000VTVG0001VTR8C1K7",
  spiele: 24,
  siege: 12,
  unentschieden: 6,
  niederlagen: 6,
  toreFor: 76,
  toreAgainst: 45,
  punkte: 42
};

const STANDINGS: LeagueStandings = {
  teamsInLeague: 14,
  rows: [UNION_ROW],
  ownRow: UNION_ROW,
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

// Alt-Zeile aus der Zeit des Namens-Matchings: die Zeilen tragen keine team-ids.
// Solche Zeilen können ein falsches (null-)ownRow enthalten → einmalig neu holen.
const PRE_TEAMID_STANDINGS = {
  teamsInLeague: 14,
  rows: [{ ...UNION_ROW, teamId: undefined }],
  ownRow: null,
  topScorers: [],
  ownTopScorers: [],
  fairnessOwnRow: null
} as unknown as LeagueStandings;

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

  /**
   * Regression: Zeilen ohne team-ids stammen aus der Zeit des Namens-Matchings,
   * das `ownRow` bei Kurznamen ("FC Sportfr. Dossenheim" vs. der Langname in der
   * Tabelle) und Spielgemeinschaften still auf null setzte. Das Wrapped fiel
   * dadurch auf die ~10 gescrapten Spiele zurück und zeigte 10 statt 34 Spiele.
   * Solche Zeilen gelten als nicht frisch, damit sie sich einmalig selbst heilen
   * statt bis zum TTL-Ablauf falsch zu bleiben.
   */
  it("Zeile ohne team-ids → einmal nachscrapen (ownRow-Reparatur)", async () => {
    getStoredMock.mockResolvedValue({
      data: PRE_TEAMID_STANDINGS,
      scrapedAt: new Date()
    });
    scrapeMock.mockResolvedValue(STANDINGS);
    const res = await getCachedStandings("t1", "2425");
    expect(res).toBe(STANDINGS);
    expect(res?.ownRow).not.toBeNull();
    expect(scrapeMock).toHaveBeenCalledOnce();
  });

  /**
   * Abgeschlossene Saison: die bekannte Staffel muss mitgegeben werden. Die
   * Mannschaftsseite leitet auf die laufende Saison um — nur die Staffel-Seite
   * ist saison-fest und damit der einzige Weg, eine alte Tabelle zu refreshen.
   */
  it("gibt die gespeicherte staffelId für eine ABGESCHLOSSENE Saison weiter", async () => {
    getStoredMock.mockResolvedValue({
      data: { ...STANDINGS, staffelId: "02TGQ5NCSC00000BVS5489BTVTLPPK10-G" },
      scrapedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    });
    scrapeMock.mockResolvedValue(STANDINGS);
    await getCachedStandings("t1", "2425");
    expect(scrapeMock).toHaveBeenCalledWith(
      "12345",
      "fg-union",
      "2425",
      "FG Union",
      "02TGQ5NCSC00000BVS5489BTVTLPPK10-G"
    );
  });

  /**
   * Laufende Saison: KEINE Staffel vorgeben. Dort leitet nichts um, und der
   * reguläre Weg erkennt die Staffel neu — eine im Saisonverlauf umgruppierte
   * Mannschaft bliebe sonst an der alten Staffel kleben.
   */
  it("gibt für die LAUFENDE Saison keine staffelId vor", async () => {
    const laufend = currentSaisonCode();
    getStoredMock.mockResolvedValue({
      data: { ...STANDINGS, staffelId: "02TGQ5NCSC00000BVS5489BTVTLPPK10-G" },
      scrapedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    });
    scrapeMock.mockResolvedValue(STANDINGS);
    await getCachedStandings("t1", laufend);
    expect(scrapeMock).toHaveBeenCalledWith(
      "12345",
      "fg-union",
      laufend,
      "FG Union",
      null
    );
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
