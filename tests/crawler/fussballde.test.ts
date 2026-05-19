import { describe, it, expect } from "vitest";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";

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
