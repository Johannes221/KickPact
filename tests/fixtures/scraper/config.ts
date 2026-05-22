// tests/fixtures/scraper/config.ts
export type FixtureTeam = {
  key: string;
  searchName: string;
  saisons: readonly string[];
};

export type FixtureClub = {
  key: string;
  searchTerm: string;
  expectedVereinIdPattern: RegExp;
  teams: readonly FixtureTeam[];
};

export const FIXTURE_CLUBS: readonly FixtureClub[] = [
  {
    key: "dossenheim",
    searchTerm: "FC Sportfreunde Dossenheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "herren2", searchName: "Herren 2", saisons: ["2526", "2425"] },
      { key: "herren3", searchName: "Herren 3", saisons: ["2526", "2425"] },
      { key: "a-junioren", searchName: "A-Junioren", saisons: ["2526"] },
      { key: "c-junioren", searchName: "C-Junioren", saisons: ["2526"] },
      { key: "damen", searchName: "Damen", saisons: ["2526"] },
    ],
  },
  {
    key: "heidelberg-kirchheim",
    searchTerm: "Heidelberg-Kirchheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "herren2", searchName: "Herren 2", saisons: ["2526", "2425"] },
      { key: "b-junioren", searchName: "B-Junioren", saisons: ["2526"] },
    ],
  },
  {
    key: "handschuhsheim",
    searchTerm: "TSV Handschuhsheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "a-junioren", searchName: "A-Junioren", saisons: ["2526"] },
      { key: "d-junioren", searchName: "D-Junioren", saisons: ["2526"] },
    ],
  },
  {
    key: "schriesheim",
    searchTerm: "Schriesheim",
    expectedVereinIdPattern: /^[A-Z0-9]+$/,
    teams: [
      { key: "herren1", searchName: "Herren 1", saisons: ["2526", "2425"] },
      { key: "herren2", searchName: "Herren 2", saisons: ["2526"] },
      { key: "a-junioren", searchName: "A-Junioren", saisons: ["2526"] },
    ],
  },
] as const;

export const FIXTURES_ROOT = "tests/fixtures/scraper";
export const HTML_ROOT = `${FIXTURES_ROOT}/html`;
export const JSON_ROOT = `${FIXTURES_ROOT}/json`;
export const MANIFEST_PATH = `${FIXTURES_ROOT}/manifest.json`;
