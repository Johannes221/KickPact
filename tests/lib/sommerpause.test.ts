import { describe, it, expect, afterEach, vi } from "vitest";
import { isCrawlerSommerpause } from "@/lib/utils/sommerpause";

describe("isCrawlerSommerpause", () => {
  afterEach(() => {
    delete process.env.SOMMERPAUSE_OVERRIDE_DISABLED;
    vi.restoreAllMocks();
  });

  it.each([
    // Anfang Juni läuft der Crawler NOCH (Saison-Finale/Relegation,
    // nachgetragene Ergebnisse) — erst ab 16. Juni Pause.
    ["2026-06-01", false],
    ["2026-06-15", false],
    ["2026-06-16", true],
    ["2026-06-30", true],
    ["2026-07-01", true],
    ["2026-07-14", true],
    // Crawler läuft wieder ab 15. Juli — fängt neue Saison-Spielpläne
    ["2026-07-15", false],
    ["2026-07-31", false],
    ["2026-08-01", false],
    // Außerhalb des Sommers
    ["2026-05-31", false],
    ["2026-03-15", false]
  ])("%s → %s", (dateStr, expected) => {
    expect(isCrawlerSommerpause(new Date(dateStr))).toBe(expected);
  });

  it("returns false when SOMMERPAUSE_OVERRIDE_DISABLED=true", () => {
    process.env.SOMMERPAUSE_OVERRIDE_DISABLED = "true";
    // 20. Juni läge regulär in der Pause — Override hebt das auf.
    expect(isCrawlerSommerpause(new Date("2026-06-20"))).toBe(false);
  });
});
