/**
 * Vorlagen-Wahl von buildStoryModel: Rückblick vs. Vorschau.
 *
 * Das ist die eine Weiche, an der die Story inhaltlich falsch werden kann —
 * eine „Vorschau" für ein längst gespieltes Spiel ist auf Instagram sofort als
 * Fehler sichtbar. DB/Storage/Tabelle sind gemockt; getestet wird nur die
 * Entscheidung.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoryMatch, StoryTeam } from "@/lib/db/queries/story";

const { teamMock, matchMock, scorersMock, opponentLogoMock } = vi.hoisted(() => ({
  teamMock: vi.fn(),
  matchMock: vi.fn(),
  scorersMock: vi.fn(),
  opponentLogoMock: vi.fn()
}));

vi.mock("@/lib/db/queries/story", () => ({
  getStoryTeam: teamMock,
  getStoryMatch: matchMock,
  getMatchScorers: scorersMock,
  getOpponentLogoUrl: opponentLogoMock
}));
// Kein Logo, keine Tabelle: beides ist bei Amateurvereinen der Normalfall und
// für die Vorlagen-Wahl irrelevant.
vi.mock("@/lib/storage/documents", () => ({ readDocumentBytes: async () => null }));
vi.mock("@/lib/recap/standings-cache", () => ({
  getCachedStandingsForRequest: async () => null
}));

import { buildStoryModel } from "@/lib/story/story-data";

const NOW = new Date("2026-07-16T12:00:00Z");
const PAST = new Date("2026-07-12T12:00:00Z");
const FUTURE = new Date("2026-07-19T12:00:00Z");

const TEAM: StoryTeam = {
  id: "team-1",
  name: "SV Beispiel",
  saison: "2526",
  league: "Kreisliga A",
  logoUrl: null,
  fussballdeTeamId: "fb-1",
  clubName: "SV Beispiel e.V."
};

function match(over: Partial<StoryMatch> = {}): StoryMatch {
  return {
    id: "match-1",
    datum: PAST,
    status: "finished",
    heimName: "SV Beispiel",
    gastName: "FC Gegner",
    heimTeamId: "fb-1",
    gastTeamId: "fb-2",
    ergebnisHeim: 3,
    ergebnisGast: 1,
    ownSide: "heim",
    ownSideReliable: true,
    ...over
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  teamMock.mockResolvedValue(TEAM);
  scorersMock.mockResolvedValue([]);
  opponentLogoMock.mockResolvedValue(null);
});

describe("buildStoryModel — Vorlagen-Wahl", () => {
  it("wählt den Rückblick, sobald ein Endstand vorliegt", async () => {
    matchMock.mockResolvedValue(match());

    const model = await buildStoryModel("team-1", "match-1", NOW);

    expect(model?.kind).toBe("rueckblick");
  });

  /**
   * Der Grund für den gemeinsamen Helfer: fussball.de trägt das Ergebnis oft
   * erst Tage nach dem Anstoß nach, bis dahin bleibt die Row `scheduled`. Am
   * Status festgemacht, hätte die Story für ein längst gespieltes Spiel eine
   * „Vorschau" mit „Heute"/„Morgen"-Label gezeigt.
   */
  it("wählt den Rückblick auch bei nachgetragenem Ergebnis auf scheduled-Row", async () => {
    matchMock.mockResolvedValue(match({ status: "scheduled", datum: PAST }));

    const model = await buildStoryModel("team-1", "match-1", NOW);

    expect(model?.kind).toBe("rueckblick");
  });

  it("wählt die Vorschau, solange kein Ergebnis vorliegt", async () => {
    matchMock.mockResolvedValue(
      match({ status: "scheduled", datum: FUTURE, ergebnisHeim: null, ergebnisGast: null })
    );

    const model = await buildStoryModel("team-1", "match-1", NOW);

    expect(model?.kind).toBe("vorschau");
  });

  /**
   * Halbe Ergebnis-Row (kaputter Scrape): der Rückblick würde `ergebnisGast`
   * per non-null-Assertion lesen und ein „3:null" ins Bild rendern.
   */
  it("wählt die Vorschau bei halbem Ergebnis statt ein Loch zu rendern", async () => {
    matchMock.mockResolvedValue(match({ ergebnisHeim: 3, ergebnisGast: null }));

    const model = await buildStoryModel("team-1", "match-1", NOW);

    expect(model?.kind).toBe("vorschau");
  });

  it("liefert null für ein Spiel, das nicht zur Mannschaft gehört", async () => {
    matchMock.mockResolvedValue(null);

    expect(await buildStoryModel("team-1", "fremd", NOW)).toBeNull();
  });
});
