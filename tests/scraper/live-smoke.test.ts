import { describe, it, expect } from "vitest";
import { searchVereine, getMannschaften, getSpiele } from "../../lib/crawler/fussballde";

const LIVE = process.env.LIVE === "1";

describe.skipIf(!LIVE)("live smoke (gegen echte fussball.de)", () => {
  it(
    "findet Dossenheim per Suche",
    async () => {
      const hits = await searchVereine("FC Sportfreunde 1910 Dossenheim");
      expect(hits.length).toBeGreaterThanOrEqual(1);
      expect(hits[0].name.toLowerCase()).toContain("dossenheim");
    },
    60_000,
  );

  it(
    "liefert ≥1 Mannschaft",
    async () => {
      const hits = await searchVereine("FC Sportfreunde 1910 Dossenheim");
      const teams = await getMannschaften(hits[0].vereinId, hits[0].slug);
      expect(teams.length).toBeGreaterThanOrEqual(1);
    },
    60_000,
  );

  it(
    "liefert ≥1 Spiel für Herren 1 (2526)",
    async () => {
      const hits = await searchVereine("FC Sportfreunde 1910 Dossenheim");
      const teams = await getMannschaften(hits[0].vereinId, hits[0].slug);
      const herren1 = teams.find((t) => t.name.toLowerCase().includes("herren"))!;
      const spiele = await getSpiele(herren1.teamId, herren1.slug, "2526");
      expect(spiele.length).toBeGreaterThanOrEqual(1);
    },
    60_000,
  );
});
