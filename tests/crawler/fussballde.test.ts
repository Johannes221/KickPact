import { describe, it, expect } from "vitest";
import { searchVereine, getMannschaften, getSpiele } from "@/lib/crawler/fussballde";

// Smoke-Tests gegen live Fußball.de. Werden NICHT im normalen Lauf ausgeführt.
// Manuell starten mit: RUN_CRAWLER_SMOKE=1 npm test -- fussballde
const SHOULD_RUN = process.env.RUN_CRAWLER_SMOKE === "1";
const itSmoke = SHOULD_RUN ? it : it.skip;

describe("fussballde crawler — live smoke", () => {
  itSmoke("findet Vereine zur Suche 'Heidelberg'", async () => {
    const results = await searchVereine("Heidelberg");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      name: expect.any(String),
      slug: expect.any(String),
      vereinId: expect.stringMatching(/^[A-Z0-9]+$/),
      url: expect.stringContaining("fussball.de")
    });
  }, 60_000);

  itSmoke("findet Mannschaften eines existierenden Vereins", async () => {
    const vereine = await searchVereine("Heidelberg");
    const ersterVerein = vereine[0];
    expect(ersterVerein).toBeDefined();
    const mannschaften = await getMannschaften(ersterVerein.vereinId, ersterVerein.slug);
    expect(mannschaften.length).toBeGreaterThan(0);
  }, 90_000);
});

describe("getSpiele — live smoke", () => {
  itSmoke("liefert vergangene Spiele einer existierenden Mannschaft", async () => {
    const vereine = await searchVereine("Heidelberg");
    const v = vereine[0];
    const mannschaften = await getMannschaften(v.vereinId, v.slug);
    const m = mannschaften[0];
    const spiele = await getSpiele(m.teamId, m.slug, m.saison);
    expect(spiele.length).toBeGreaterThanOrEqual(0);
    if (spiele.length > 0) {
      expect(spiele[0]).toMatchObject({
        spielId: expect.stringMatching(/^[A-Z0-9]+$/),
        datum: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/),
        heim: expect.any(String),
        gast: expect.any(String)
      });
    }
  }, 120_000);
});
