import { describe, expect, it } from "vitest";
import { getTeamSubNavTabs } from "@/app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav";

/**
 * Verifiziert das Plan-aware Tab-Filtering der Team-SubNav.
 *
 * Hintergrund: Bei einer Vereinslizenz leben `Abo` + `Einstellungen` auf
 * Club-Ebene (und werden vom VereinSubNav darüber bereitgestellt). Würde
 * der Team-SubNav sie ebenfalls zeigen, hätten Nutzer pro Page zwei
 * identische Einträge — genau das doppelte-Menü-Problem, das wir hier fixen.
 */

describe("getTeamSubNavTabs", () => {
  it("returns the full tab set for basic plan", () => {
    const tabs = getTeamSubNavTabs("basic");
    expect(tabs.map((t) => t.href)).toEqual([
      "",
      "/pacts",
      "/spiele",
      "/finanzen",
      "/abo",
      "/einstellungen"
    ]);
  });

  it("returns the full tab set for pro plan", () => {
    const tabs = getTeamSubNavTabs("pro");
    expect(tabs.map((t) => t.href)).toEqual([
      "",
      "/pacts",
      "/spiele",
      "/finanzen",
      "/abo",
      "/einstellungen"
    ]);
  });

  it("drops /abo and /einstellungen for verein plan", () => {
    const tabs = getTeamSubNavTabs("verein");
    expect(tabs.map((t) => t.href)).toEqual([
      "",
      "/pacts",
      "/spiele",
      "/finanzen"
    ]);
    expect(tabs.some((t) => t.href === "/abo")).toBe(false);
    expect(tabs.some((t) => t.href === "/einstellungen")).toBe(false);
  });

  it("returns the full tab set for null plan (safe default)", () => {
    const tabs = getTeamSubNavTabs(null);
    expect(tabs.map((t) => t.href)).toEqual([
      "",
      "/pacts",
      "/spiele",
      "/finanzen",
      "/abo",
      "/einstellungen"
    ]);
  });
});
