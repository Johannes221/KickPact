import { describe, expect, it } from "vitest";
import { primaryDestinationFor } from "@/lib/auth/primary-role";
import type { UserIdentities } from "@/lib/db/queries/user-identities";

function clubVerein(slug: string): UserIdentities["clubs"][number] {
  return {
    clubId: `club-${slug}`,
    slug,
    name: `Club ${slug}`,
    logoUrl: null,
    role: "admin",
    teamCount: 1,
    sponsorCount: 0,
    effectivePlan: "verein",
    firstTeamId: null,
    firstTeamName: null
  };
}

function sponsor(): NonNullable<UserIdentities["sponsor"]> {
  return {
    id: "sp-1",
    displayName: "Tante Erna",
    activePledgeCount: 0,
    thisMonthCents: 0
  };
}

describe("primaryDestinationFor", () => {
  it("0 Identitäten → /signup", () => {
    const r = primaryDestinationFor({ clubs: [], teamOnly: [], sponsor: null }, null);
    expect(r).toEqual({ href: "/signup", resolvedId: null, defaulted: true });
  });

  it("ohne gesetzte Hauptrolle → erste Identität als Default (defaulted=true)", () => {
    const ids: UserIdentities = {
      clubs: [clubVerein("acn")],
      teamOnly: [],
      sponsor: sponsor()
    };
    const r = primaryDestinationFor(ids, null);
    // flattenIdentities ordnet clubs vor sponsor → erster Eintrag = Club
    expect(r.href).toBe("/verein/acn");
    expect(r.resolvedId).toBe("club-club-acn");
    expect(r.defaulted).toBe(true);
  });

  it("gültige Hauptrolle gesetzt → genau deren Dashboard (defaulted=false, kein /select-role)", () => {
    const ids: UserIdentities = {
      clubs: [clubVerein("acn")],
      teamOnly: [],
      sponsor: sponsor()
    };
    const r = primaryDestinationFor(ids, "sponsor-sp-1");
    expect(r).toEqual({ href: "/sponsor", resolvedId: "sponsor-sp-1", defaulted: false });
  });

  it("Hauptrolle zeigt auf gelöschte Rolle → Fallback auf erste Identität", () => {
    const ids: UserIdentities = {
      clubs: [clubVerein("acn")],
      teamOnly: [],
      sponsor: null
    };
    // gespeicherte Rolle (sponsor) existiert nicht mehr
    const r = primaryDestinationFor(ids, "sponsor-sp-1");
    expect(r.href).toBe("/verein/acn");
    expect(r.defaulted).toBe(true);
  });
});
