import { describe, expect, it } from "vitest";
import { getTeamSubNavTabs } from "@/app/(verein)/verein/[slug]/mannschaft/[teamId]/_components/team-sub-nav";

describe("getTeamSubNavTabs", () => {
  it("enthält einen Profil-Tab und stellt die ersten 4 fürs Mobile-Primärset", () => {
    const tabs = getTeamSubNavTabs("pro");
    const labels = tabs.map((t) => t.label);
    expect(labels).toContain("Profil");
    // Erste 4 = Mobile-Primärset (BottomTabBar slice(0,4)).
    expect(labels.slice(0, 4)).toEqual(["Übersicht", "Pacts", "Spiele", "Profil"]);
  });

  it("verein-Plan entfernt Abo + Einstellungen (im Overflow), Profil bleibt", () => {
    const labels = getTeamSubNavTabs("verein").map((t) => t.label);
    expect(labels).toContain("Profil");
    expect(labels).not.toContain("Abo");
    expect(labels).not.toContain("Einstellungen");
  });
});
