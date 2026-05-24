import { describe, expect, it } from "vitest";
import { pickAuthenticatedSignupDestination } from "@/lib/auth/signup-destination";
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

function teamOnlyIdentity(
  clubSlug: string,
  teamId: string
): UserIdentities["teamOnly"][number] {
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

describe("pickAuthenticatedSignupDestination — kein role", () => {
  it("0 Identities → /signup (caller darf Add-Role-Chooser rendern)", () => {
    expect(pickAuthenticatedSignupDestination(emptyIdentities(), null)).toBe(
      "/signup"
    );
  });

  it("1 Club → /verein/{slug}", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("dossenheim")],
      teamOnly: [],
      sponsor: null
    };
    expect(pickAuthenticatedSignupDestination(ids, null)).toBe(
      "/verein/dossenheim"
    );
  });

  it("nur Sponsor → /sponsor", () => {
    const ids: UserIdentities = {
      clubs: [],
      teamOnly: [],
      sponsor: sponsorIdentity()
    };
    expect(pickAuthenticatedSignupDestination(ids, null)).toBe("/sponsor");
  });

  it("2+ Identities → /select-role", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("dossi")],
      teamOnly: [],
      sponsor: sponsorIdentity()
    };
    expect(pickAuthenticatedSignupDestination(ids, null)).toBe("/select-role");
  });

  it("team-only allein → Team-Deep-Link", () => {
    const ids: UserIdentities = {
      clubs: [],
      teamOnly: [teamOnlyIdentity("schriesheim", "team-99")],
      sponsor: null
    };
    expect(pickAuthenticatedSignupDestination(ids, null)).toBe(
      "/verein/schriesheim/mannschaft/team-99"
    );
  });
});

describe("pickAuthenticatedSignupDestination — role=sponsor", () => {
  it("Sponsor-Profile vorhanden → /sponsor (skip Onboarding)", () => {
    const ids: UserIdentities = {
      clubs: [],
      teamOnly: [],
      sponsor: sponsorIdentity()
    };
    expect(pickAuthenticatedSignupDestination(ids, "sponsor")).toBe("/sponsor");
  });

  it("Verein-Admin ohne Sponsor → /sponsor/onboarding (Add-Role)", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("dossenheim")],
      teamOnly: [],
      sponsor: null
    };
    expect(pickAuthenticatedSignupDestination(ids, "sponsor")).toBe(
      "/sponsor/onboarding"
    );
  });

  it("nichts da → /sponsor/onboarding", () => {
    expect(pickAuthenticatedSignupDestination(emptyIdentities(), "sponsor")).toBe(
      "/sponsor/onboarding"
    );
  });
});

describe("pickAuthenticatedSignupDestination — role=verein / mannschaft", () => {
  it("role=verein + Club vorhanden → Deep-Link", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("neuenheim")],
      teamOnly: [],
      sponsor: null
    };
    expect(pickAuthenticatedSignupDestination(ids, "verein")).toBe(
      "/verein/neuenheim"
    );
  });

  it("role=mannschaft + Club vorhanden → Verein-Dashboard", () => {
    const ids: UserIdentities = {
      clubs: [clubIdentity("neuenheim")],
      teamOnly: [],
      sponsor: null
    };
    expect(pickAuthenticatedSignupDestination(ids, "mannschaft")).toBe(
      "/verein/neuenheim"
    );
  });

  it("role=mannschaft + nur Team-Membership → Team-Deep-Link", () => {
    const ids: UserIdentities = {
      clubs: [],
      teamOnly: [teamOnlyIdentity("schriesheim", "team-7")],
      sponsor: null
    };
    expect(pickAuthenticatedSignupDestination(ids, "mannschaft")).toBe(
      "/verein/schriesheim/mannschaft/team-7"
    );
  });

  it("role=verein + nur Sponsor → Onboarding-Wizard", () => {
    const ids: UserIdentities = {
      clubs: [],
      teamOnly: [],
      sponsor: sponsorIdentity()
    };
    expect(pickAuthenticatedSignupDestination(ids, "verein")).toBe(
      "/onboarding/verein/1"
    );
  });

  it("role=mannschaft + nichts → Onboarding-Wizard", () => {
    expect(
      pickAuthenticatedSignupDestination(emptyIdentities(), "mannschaft")
    ).toBe("/onboarding/verein/1");
  });
});
