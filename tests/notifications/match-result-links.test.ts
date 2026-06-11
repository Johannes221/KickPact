/**
 * A1 (Phase 4 / Sponsor-Journey): Deep-Link-Auswahl für den Ergebnis-Push.
 *
 * Sponsoren dürfen NICHT auf die interne Vereins-Route gelinkt werden
 * (`/verein/<slug>/mannschaft/<id>` bounced Nicht-Mitglieder am Guard) —
 * sie bekommen das öffentliche Profil `/m/<publicSlug>` bzw. als Fallback
 * `/sponsor`. Vereins-Mitglieder behalten den internen Link.
 */
import { describe, expect, it } from "vitest";
import { buildMatchResultLinkGroups } from "@/lib/notifications/match-result-links";

const base = {
  teamId: "team_1",
  clubSlug: "fc-test",
  publicSlug: "fc-test-1-herren"
};

describe("buildMatchResultLinkGroups", () => {
  it("Mitglieder bekommen den internen Team-Link", () => {
    const groups = buildMatchResultLinkGroups({
      ...base,
      memberUserIds: ["u_member"],
      sponsorUserIds: []
    });
    expect(groups.members.userIds).toEqual(["u_member"]);
    expect(groups.members.link).toBe("/verein/fc-test/mannschaft/team_1");
  });

  it("Sponsoren bekommen das öffentliche Profil /m/<publicSlug>", () => {
    const groups = buildMatchResultLinkGroups({
      ...base,
      memberUserIds: [],
      sponsorUserIds: ["u_sponsor"]
    });
    expect(groups.sponsors.userIds).toEqual(["u_sponsor"]);
    expect(groups.sponsors.link).toBe("/m/fc-test-1-herren");
  });

  it("Sponsor-Fallback ohne publicSlug ist /sponsor", () => {
    const groups = buildMatchResultLinkGroups({
      ...base,
      publicSlug: null,
      memberUserIds: [],
      sponsorUserIds: ["u_sponsor"]
    });
    expect(groups.sponsors.link).toBe("/sponsor");
  });

  it("Mitglieder-Link ist null ohne clubSlug (kein toter interner Link)", () => {
    const groups = buildMatchResultLinkGroups({
      ...base,
      clubSlug: null,
      memberUserIds: ["u_member"],
      sponsorUserIds: []
    });
    expect(groups.members.link).toBeNull();
  });

  it("User, der Mitglied UND Sponsor ist, landet nur in der Mitglieder-Gruppe", () => {
    const groups = buildMatchResultLinkGroups({
      ...base,
      memberUserIds: ["u_both", "u_member"],
      sponsorUserIds: ["u_both", "u_sponsor"]
    });
    expect(groups.members.userIds).toEqual(["u_both", "u_member"]);
    expect(groups.sponsors.userIds).toEqual(["u_sponsor"]);
  });

  it("dedupliziert innerhalb der Gruppen", () => {
    const groups = buildMatchResultLinkGroups({
      ...base,
      memberUserIds: ["u_a", "u_a"],
      sponsorUserIds: ["u_s", "u_s"]
    });
    expect(groups.members.userIds).toEqual(["u_a"]);
    expect(groups.sponsors.userIds).toEqual(["u_s"]);
  });
});
