/**
 * Fixture-based unit tests for getSpiele's prev+next extraction/mapping logic.
 *
 * These assert the behaviour added when the crawler was extended to also pull
 * KOMMENDE Spiele (ajax.team.next.games) on top of vergangene Spiele, and to
 * derive a per-match `vergangen`/`status` flag instead of hardcoding
 * `vergangen: true`.
 *
 * Pure fixture-driven — NO live fussball.de calls (captcha risk). The synthetic
 * HTML fixtures use unambiguous dates (2024 = past, 2099 = future) so the
 * past/future classification is stable regardless of when the test runs.
 *
 * Live verification against the real site is out of scope here and tracked as
 * a manual / Phase-8 task (see getSpiele docblock).
 */
import { describe, it, expect } from "vitest";
import { withMockedBrowser } from "../../setup/playwright-mocks";
import { getSpiele, type SpielListItem } from "../../../lib/crawler/fussballde";

const TEAM_ID = "0123456789ABCDEFGHIJ"; // 20-char id shape
const SLUG = "sv-musterhausen";
// getSpiele filtert Spiele VOR dem Saisonstart (1. Juli des Codes) weg. Die
// Fixtures nutzen bewusst lauf-datums-unabhängige Absolut-Daten (2020/2024 =
// past, 2099 = future). Damit der Filter sie nicht als "Vorsaison" verwirft,
// fragen wir eine Saison ab, deren Start (hier 2019-07-01) vor dem ältesten
// Fixture-Datum (31.05.2020) liegt. vergangen/scheduled bleibt rein über das
// echte `today` bzw. den Endpoint (prev/next) bestimmt.
const SAISON = "1920";

const PAST_IDS = [
  "02PAST001AA000000VS5489BUVSSD35NB",
  "02PAST002BB000000VS5489BUVSSD35NB"
];
const FUTURE_IDS = [
  "02NEXT001AA000000VS5489BUVSSD35NB",
  "02NEXT002BB000000VS5489BUVSSD35NB"
];
/** Aus next.games, aber mit VERGANGENEM Datum (Ergebnis noch nicht eingetragen). */
const NEXT_BUT_PAST_DATE_ID = "02NEXT003CC000000VS5489BUVSSD35NB";

const ROUTES = [
  {
    matchUrl: /ajax\.team\.prev\.games/,
    htmlPath: "synthetic/prev-games.html"
  },
  {
    matchUrl: /ajax\.team\.next\.games/,
    htmlPath: "synthetic/next-games.html"
  }
  // main team page (Strategy 2) intentionally unrouted → mock serves 404 (empty)
];

describe("getSpiele — prev + next extraction", () => {
  it("returns BOTH past and future matches", async () => {
    const spiele = await withMockedBrowser(ROUTES, () =>
      getSpiele(TEAM_ID, SLUG, SAISON)
    );

    const ids = spiele.map((s) => s.spielId);
    for (const id of [...PAST_IDS, ...FUTURE_IDS]) {
      expect(ids).toContain(id);
    }
  }, 120_000);

  it("deduplicates by spielId across all strategies", async () => {
    const spiele = await withMockedBrowser(ROUTES, () =>
      getSpiele(TEAM_ID, SLUG, SAISON)
    );
    const ids = spiele.map((s) => s.spielId);
    expect(new Set(ids).size).toBe(ids.length);
  }, 120_000);

  it("flags past matches as vergangen=true / status=finished", async () => {
    const spiele = await withMockedBrowser(ROUTES, () =>
      getSpiele(TEAM_ID, SLUG, SAISON)
    );
    for (const id of PAST_IDS) {
      const m = spiele.find((s) => s.spielId === id) as SpielListItem;
      expect(m).toBeTruthy();
      expect(m.vergangen).toBe(true);
      expect(m.status).toBe("finished");
    }
  }, 120_000);

  it("flags future matches as vergangen=false / status=scheduled", async () => {
    const spiele = await withMockedBrowser(ROUTES, () =>
      getSpiele(TEAM_ID, SLUG, SAISON)
    );
    for (const id of FUTURE_IDS) {
      const m = spiele.find((s) => s.spielId === id) as SpielListItem;
      expect(m).toBeTruthy();
      expect(m.vergangen).toBe(false);
      expect(m.status).toBe("scheduled");
    }
  }, 120_000);

  it("keeps a next.games match scheduled even if its date is in the past (no 0:0 phantom)", async () => {
    // Regression: ein Spiel aus next.games, dessen Datum schon vorbei ist
    // (fussball.de hat das Ergebnis noch nicht nachgeführt), darf NICHT per
    // Datum als "finished" gelten — sonst scrapt der Detail-Scrape 0 Tore und
    // ein 0:0-Phantom landet in der DB. Der Status kommt vom Endpoint.
    const spiele = await withMockedBrowser(ROUTES, () =>
      getSpiele(TEAM_ID, SLUG, SAISON)
    );
    const m = spiele.find((s) => s.spielId === NEXT_BUT_PAST_DATE_ID) as SpielListItem;
    expect(m).toBeTruthy();
    expect(m.status).toBe("scheduled");
  }, 120_000);

  it("normalises datum to DD.MM.YYYY for every row", async () => {
    const spiele = await withMockedBrowser(ROUTES, () =>
      getSpiele(TEAM_ID, SLUG, SAISON)
    );
    expect(spiele.length).toBeGreaterThan(0);
    for (const s of spiele) {
      expect(s.datum).toMatch(/^\d{2}\.\d{2}\.\d{4}$/);
    }
  }, 120_000);

  it("sorts newest first (future before past)", async () => {
    const spiele = await withMockedBrowser(ROUTES, () =>
      getSpiele(TEAM_ID, SLUG, SAISON)
    );
    // 2099 dates must come before 2024 dates
    const firstFutureIdx = spiele.findIndex((s) => FUTURE_IDS.includes(s.spielId));
    const firstPastIdx = spiele.findIndex((s) => PAST_IDS.includes(s.spielId));
    expect(firstFutureIdx).toBeGreaterThanOrEqual(0);
    expect(firstPastIdx).toBeGreaterThanOrEqual(0);
    expect(firstFutureIdx).toBeLessThan(firstPastIdx);
  }, 120_000);
});
