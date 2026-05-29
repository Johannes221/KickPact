import { describe, it, expect } from "vitest";
import { isTeamCrawling, CRAWL_STALE_MS } from "@/lib/crawler/crawl-status";

describe("isTeamCrawling", () => {
  const now = new Date("2026-05-29T12:00:00Z");

  it("false wenn nie gestartet (crawlStartedAt null)", () => {
    expect(isTeamCrawling(null, null, now)).toBe(false);
    expect(isTeamCrawling(null, new Date(now), now)).toBe(false);
  });

  it("true wenn gerade gestartet und noch nicht abgeschlossen", () => {
    const started = new Date(now.getTime() - 5_000); // 5s her
    expect(isTeamCrawling(started, null, now)).toBe(true);
  });

  it("false wenn completed am/nach dem Start liegt (Crawl fertig)", () => {
    const started = new Date(now.getTime() - 60_000);
    const completed = new Date(now.getTime() - 30_000); // nach start
    expect(isTeamCrawling(started, completed, now)).toBe(false);
  });

  it("true wenn ein NEUER Start nach einem alten completed liegt (Re-Crawl)", () => {
    const completed = new Date(now.getTime() - 60_000); // alter Lauf
    const started = new Date(now.getTime() - 10_000); // neuer Start danach
    expect(isTeamCrawling(started, completed, now)).toBe(true);
  });

  it("false wenn Start älter als der Stale-Guard ist (hängender Job)", () => {
    const started = new Date(now.getTime() - (CRAWL_STALE_MS + 1_000));
    expect(isTeamCrawling(started, null, now)).toBe(false);
  });

  it("true direkt am Rand des Stale-Guards (knapp drunter)", () => {
    const started = new Date(now.getTime() - (CRAWL_STALE_MS - 1_000));
    expect(isTeamCrawling(started, null, now)).toBe(true);
  });
});
