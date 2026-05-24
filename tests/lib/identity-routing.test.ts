import { describe, expect, it } from "vitest";
import {
  pickDashboardDestination,
  activeIdentityFromPath,
  type ActiveIdentity
} from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";

function emptyIdentities(): UserIdentities {
  return { clubs: [], teamOnly: [], sponsor: null };
}

function clubIdentity(slug: string): UserIdentities["clubs"][number] {
  return {
    clubId: `club-${slug}`,
    slug,
    name: `Club ${slug}`,
    logoUrl: null,
    role: "admin",
    teamCount: 3,
    sponsorCount: 5
  };
}

function teamOnlyIdentity(clubSlug: string, teamId: string): UserIdentities["teamOnly"][number] {
  return {
    teamId,
    teamName: "C-Jugend",
    clubSlug,
    clubName: `Club ${clubSlug}`,
    role: "trainer",
    saison: "2526"
  };
}

function sponsorIdentity(): UserIdentities["sponsor"] {
  return {
    id: "sp-1",
    displayName: "Tante Erna",
    activePledgeCount: 2,
    thisMonthCents: 1500
  };
}

describe("pickDashboardDestination", () => {
  it("zero identities → /signup", () => {
    expect(pickDashboardDestination(emptyIdentities())).toBe("/signup");
  });

  it("one club → /verein/{slug}", () => {
    const ids: UserIdentities = { clubs: [clubIdentity("acn")], teamOnly: [], sponsor: null };
    expect(pickDashboardDestination(ids)).toBe("/verein/acn");
  });

  it("one team-only → /verein/{clubSlug}/mannschaft/{teamId}", () => {
    const ids: UserIdentities = {
      clubs: [],
      teamOnly: [teamOnlyIdentity("acn", "team-42")],
      sponsor: null
    };
    expect(pickDashboardDestination(ids)).toBe("/verein/acn/mannschaft/team-42");
  });

  it("one sponsor → /sponsor", () => {
    const ids: UserIdentities = { clubs: [], teamOnly: [], sponsor: sponsorIdentity() };
    expect(pickDashboardDestination(ids)).toBe("/sponsor");
  });

  it("multi (club + sponsor) → /select-role", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("acn")],
      teamOnly: [],
      sponsor: sponsorIdentity()
    };
    expect(pickDashboardDestination(ids)).toBe("/select-role");
  });

  it("multi (two clubs) → /select-role", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("acn"), clubIdentity("dossi")],
      teamOnly: [],
      sponsor: null
    };
    expect(pickDashboardDestination(ids)).toBe("/select-role");
  });

  it("multi (club + team-only in different club) → /select-role", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("acn")],
      teamOnly: [teamOnlyIdentity("dossi", "team-9")],
      sponsor: null
    };
    expect(pickDashboardDestination(ids)).toBe("/select-role");
  });
});

describe("activeIdentityFromPath", () => {
  it("/ → neutral", () => {
    const r: ActiveIdentity = activeIdentityFromPath("/");
    expect(r.kind).toBe("neutral");
  });

  it("/login → neutral", () => {
    expect(activeIdentityFromPath("/login").kind).toBe("neutral");
  });

  it("/select-role → neutral", () => {
    expect(activeIdentityFromPath("/select-role").kind).toBe("neutral");
  });

  it("/verein/asc-neuenheim → club with slug", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim");
    expect(r.kind).toBe("club");
    if (r.kind !== "club") return;
    expect(r.slug).toBe("asc-neuenheim");
  });

  it("/verein/asc-neuenheim/sponsoren → still club (subroute)", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim/sponsoren");
    expect(r.kind).toBe("club");
    if (r.kind !== "club") return;
    expect(r.slug).toBe("asc-neuenheim");
  });

  it("/verein/asc-neuenheim/mannschaft/team-42 → team", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim/mannschaft/team-42");
    expect(r.kind).toBe("team");
    if (r.kind !== "team") return;
    expect(r.slug).toBe("asc-neuenheim");
    expect(r.teamId).toBe("team-42");
  });

  it("/verein/asc-neuenheim/mannschaft/team-42/spiel/m-1 → team (deeper subroute)", () => {
    const r = activeIdentityFromPath("/verein/asc-neuenheim/mannschaft/team-42/spiel/m-1");
    expect(r.kind).toBe("team");
    if (r.kind !== "team") return;
    expect(r.slug).toBe("asc-neuenheim");
    expect(r.teamId).toBe("team-42");
  });

  it("/sponsor → sponsor", () => {
    expect(activeIdentityFromPath("/sponsor").kind).toBe("sponsor");
  });

  it("/sponsor/discover → sponsor", () => {
    expect(activeIdentityFromPath("/sponsor/discover").kind).toBe("sponsor");
  });

  it("/dashboard → neutral (transitional)", () => {
    expect(activeIdentityFromPath("/dashboard").kind).toBe("neutral");
  });
});
