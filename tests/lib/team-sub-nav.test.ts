import { describe, expect, it } from "vitest";
import {
  getTeamSubNavTabs,
  getTeamOverflowTabs
} from "@/app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav";

describe("getTeamSubNavTabs", () => {
  it("liefert die 5 primären Mobile-Tabs in fester Reihenfolge zuerst", () => {
    const labels = getTeamSubNavTabs("pro").map((t) => t.label);
    // Erste 5 = Mobile-Primärset (BottomTabBar, kein "Mehr" mehr).
    expect(labels.slice(0, 5)).toEqual([
      "Übersicht",
      "Spiele",
      "Pacts",
      "Sponsoren",
      "Profil"
    ]);
    expect(labels).toContain("Profil");
  });

  it("verein-Plan entfernt Abo + Einstellungen (im Overflow), Primärset bleibt", () => {
    const labels = getTeamSubNavTabs("verein").map((t) => t.label);
    expect(labels.slice(0, 5)).toEqual([
      "Übersicht",
      "Spiele",
      "Pacts",
      "Sponsoren",
      "Profil"
    ]);
    expect(labels).not.toContain("Abo");
    expect(labels).not.toContain("Einstellungen");
  });

  it("getTeamOverflowTabs: nur Sekundär-Tabs, plan-gefiltert", () => {
    expect(getTeamOverflowTabs("pro").map((t) => t.label)).toEqual([
      "Finanzen",
      "Abo",
      "Einstellungen"
    ]);
    expect(getTeamOverflowTabs("verein").map((t) => t.label)).toEqual([
      "Finanzen"
    ]);
  });
});
