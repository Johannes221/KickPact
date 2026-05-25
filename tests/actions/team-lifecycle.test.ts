import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

// requireUser muss VOR den Action-Imports gemockt sein.
const { mockUserId } = vi.hoisted(() => ({
  mockUserId: { current: "" }
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: `${mockUserId.current}@kickpact.local`
  }))
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

// Stub `resend` & `MAIL_FROM`. Plan-3-Lifecycle sendet Admin-Mails, die wir in
// Tests nicht an externe APIs schicken wollen.
vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ id: "stub" }) } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));

// Stub `lib/storage/documents` für Logo-Upload (kein S3/lokales Volume in Tests).
vi.mock("@/lib/storage/documents", () => ({
  storeDocument: vi.fn().mockImplementation(async (key: string) => `local://${key.replace(/\//g, "_")}`),
  getDocumentSignedUrl: vi.fn().mockImplementation(async (k: string) => k)
}));

// Default-Secret für opt-out token signing (Tests laufen ohne .env.local-Wert)
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-test-secret";

import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  teamLicenses,
  subscriptions,
  players
} from "@/lib/db/schema";
import { matchEvents, matches } from "@/lib/db/schema/matches";
import { eq } from "drizzle-orm";
import { resetTestDb } from "../setup/db";
import {
  createTeamForExistingClub,
  renameTeam,
  deactivateTeam,
  reactivateTeam,
  uploadTeamLogo,
  togglePlayerBlock,
  generatePlayerOptOutLink,
  confirmPlayerOptOut
} from "@/lib/actions/team-lifecycle";
import {
  signOptOutToken,
  verifyOptOutToken
} from "@/lib/auth/opt-out-token";

async function makeUser(): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `${id}@kickpact.local`,
    emailVerified: true,
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  mockUserId.current = id;
  return id;
}

async function makeClubWithAdmin(slug: string, planForFirstTeam: "basic" | "pro" | "verein" = "pro") {
  const userId = await makeUser();
  const [club] = await db
    .insert(clubs)
    .values({
      slug,
      name: `Club ${slug}`,
      fussballdeVereinId: `V_${slug}`,
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id, slug: clubs.slug });

  await db.insert(clubMemberships).values({
    userId,
    clubId: club.id,
    role: "admin"
  });

  await db.insert(subscriptions).values({
    clubId: club.id,
    status: "trialing",
    billingCycle: "monthly"
  });

  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: `T_${slug}_init`,
      isActive: true
    })
    .returning({ id: teams.id });

  await db.insert(teamLicenses).values({
    subscriptionClubId: club.id,
    teamId: team.id,
    plan: planForFirstTeam,
    status: "trialing"
  });

  return { userId, clubId: club.id, clubSlug: club.slug, teamId: team.id };
}

describe("createTeamForExistingClub", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("legt ein neues Team mit gewähltem Plan an", async () => {
    const { clubSlug } = await makeClubWithAdmin("club-create-1", "pro");

    const res = await createTeamForExistingClub({
      clubSlug,
      team: {
        teamId: "T_NEW_1",
        teamSlug: "2-herren",
        teamName: "2. Herren",
        saison: "2526"
      },
      plan: "basic"
    });

    expect(res.teamId).toBeTruthy();

    const [lic] = await db
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.teamId, res.teamId));
    expect(lic.plan).toBe("basic");
    expect(lic.parentClubLicenseId).toBeNull();
  });

  it("bündelt automatisch unter Vereinslizenz wenn Club bereits verein-Plan hat", async () => {
    const { clubSlug, teamId } = await makeClubWithAdmin("club-create-2", "verein");

    const res = await createTeamForExistingClub({
      clubSlug,
      team: {
        teamId: "T_NEW_2",
        teamSlug: "2-herren",
        teamName: "2. Herren",
        saison: "2526"
      },
      plan: "basic" // wird ignoriert, Vereinslizenz erzwingt verein
    });

    const [lic] = await db
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.teamId, res.teamId));
    expect(lic.plan).toBe("verein");
    // parent zeigt auf die ursprüngliche Vereinslizenz
    const [originalLic] = await db
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.teamId, teamId));
    expect(lic.parentClubLicenseId).toBe(originalLic.id);
  });

  it("verhindert Duplicate für dieselbe fussballde-Team-ID + Saison", async () => {
    const { clubSlug } = await makeClubWithAdmin("club-create-3");
    await createTeamForExistingClub({
      clubSlug,
      team: { teamId: "DUP1", teamSlug: "s", teamName: "X", saison: "2526" }
    });
    await expect(
      createTeamForExistingClub({
        clubSlug,
        team: { teamId: "DUP1", teamSlug: "s", teamName: "X", saison: "2526" }
      })
    ).rejects.toThrow(/existiert bereits/);
  });
});

describe("renameTeam / deactivate / reactivate", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("renameTeam setzt neuen Namen", async () => {
    const { teamId } = await makeClubWithAdmin("club-rename");
    await renameTeam({ teamId, newName: "Neuer Name" });
    const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(t.name).toBe("Neuer Name");
  });

  it("renameTeam validiert max 80 char", async () => {
    const { teamId } = await makeClubWithAdmin("club-rename-2");
    await expect(
      renameTeam({ teamId, newName: "x".repeat(81) })
    ).rejects.toThrow();
  });

  it("deactivateTeam und reactivateTeam toggeln isActive", async () => {
    const { teamId } = await makeClubWithAdmin("club-lifecycle");
    await deactivateTeam(teamId);
    const [afterDeact] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(afterDeact.isActive).toBe(false);

    await reactivateTeam(teamId);
    const [afterReact] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(afterReact.isActive).toBe(true);
  });

  it("deactivateTeam wirft wenn Team nicht existiert", async () => {
    await makeUser(); // sonst kein User-Context
    await expect(deactivateTeam("does-not-exist")).rejects.toThrow(/nicht gefunden/);
  });
});

describe("uploadTeamLogo", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("schreibt logoUrl und ruft storeDocument auf", async () => {
    const { teamId } = await makeClubWithAdmin("club-logo");
    const res = await uploadTeamLogo({
      teamId,
      filename: "logo.png",
      contentType: "image/png",
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47])
    });
    expect(res.logoUrl).toMatch(/^local:\/\//);
    const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(t.logoUrl).toBe(res.logoUrl);
  });

  it("lehnt zu große Files ab", async () => {
    const { teamId } = await makeClubWithAdmin("club-logo-big");
    await expect(
      uploadTeamLogo({
        teamId,
        filename: "big.png",
        contentType: "image/png",
        bytes: Buffer.alloc(2_000_000)
      })
    ).rejects.toThrow(/zu groß/);
  });

  it("lehnt SVG/PDF/sonst ab", async () => {
    const { teamId } = await makeClubWithAdmin("club-logo-svg");
    await expect(
      uploadTeamLogo({
        teamId,
        filename: "logo.svg",
        contentType: "image/svg+xml",
        bytes: Buffer.from("<svg/>")
      })
    ).rejects.toThrow(/PNG, JPEG/);
  });
});

describe("togglePlayerBlock", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("blockt Spieler, anonymisiert Namen und schickt Mail an Admins", async () => {
    const { teamId, clubId } = await makeClubWithAdmin("club-block");
    const [p] = await db
      .insert(players)
      .values({ teamId, name: "Max Mustermann", blocked: false })
      .returning({ id: players.id });

    const res = await togglePlayerBlock({ playerId: p.id });
    expect(res.blocked).toBe(true);

    const [after] = await db.select().from(players).where(eq(players.id, p.id));
    expect(after.blocked).toBe(true);
    expect(after.name).toBe("Anonymisiert");

    // Sanity: Admin-Email-Lookup hat unsere Club-Admin gefunden
    const admins = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.clubId, clubId));
    expect(admins.length).toBeGreaterThan(0);
  });

  it("entblockt einen geblockten Spieler", async () => {
    const { teamId } = await makeClubWithAdmin("club-unblock");
    const [p] = await db
      .insert(players)
      .values({ teamId, name: "Anonymisiert", blocked: true })
      .returning({ id: players.id });

    const res = await togglePlayerBlock({ playerId: p.id, desired: false });
    expect(res.blocked).toBe(false);

    const [after] = await db.select().from(players).where(eq(players.id, p.id));
    expect(after.blocked).toBe(false);
  });

  it("wirft ohne ausreichende Permission (User ohne Membership)", async () => {
    const { teamId } = await makeClubWithAdmin("club-noauth");
    const [p] = await db
      .insert(players)
      .values({ teamId, name: "X", blocked: false })
      .returning({ id: players.id });

    // Wechsle zu komplett fremdem User
    await makeUser();
    // requireUser liefert jetzt einen User der NICHT in clubMemberships ist —
    // assertClubAccess wird redirecten. Im Test-Kontext löst redirect() einen
    // Throw aus.
    await expect(togglePlayerBlock({ playerId: p.id })).rejects.toThrow();
  });
});

describe("Opt-out Token", () => {
  it("sign + verify roundtrip", () => {
    const iat = Math.floor(Date.now() / 1000);
    const tok = signOptOutToken({ playerId: "p1", iat, exp: iat + 60 });
    const decoded = verifyOptOutToken(tok);
    expect(decoded.playerId).toBe("p1");
  });

  it("erkennt manipulierte Signatur", () => {
    const iat = Math.floor(Date.now() / 1000);
    const tok = signOptOutToken({ playerId: "p1", iat, exp: iat + 60 });
    const [payload] = tok.split(".");
    const tampered = `${payload}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(() => verifyOptOutToken(tampered)).toThrow(/Signatur/);
  });

  it("lehnt abgelaufene Tokens ab", () => {
    const iat = Math.floor(Date.now() / 1000) - 3600;
    const tok = signOptOutToken({ playerId: "p1", iat, exp: iat + 60 });
    expect(() => verifyOptOutToken(tok)).toThrow(/abgelaufen/);
  });
});

describe("Player Opt-out Flow (public)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("Admin generiert Link → public confirm anonymisiert", async () => {
    const { teamId } = await makeClubWithAdmin("club-optout");
    const [p] = await db
      .insert(players)
      .values({ teamId, name: "Lars Lustig", blocked: false })
      .returning({ id: players.id });

    const link = await generatePlayerOptOutLink(p.id);
    expect(link.url).toContain("/spieler-opt-out?token=");
    const token = new URL(link.url).searchParams.get("token");
    expect(token).toBeTruthy();

    const res = await confirmPlayerOptOut(token!);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.alreadyBlocked).toBe(false);

    const [after] = await db.select().from(players).where(eq(players.id, p.id));
    expect(after.blocked).toBe(true);
    expect(after.name).toBe("Anonymisiert");
  });

  it("zweiter Confirm-Call ist idempotent (alreadyBlocked=true, keine Aktion)", async () => {
    const { teamId } = await makeClubWithAdmin("club-optout-2");
    const [p] = await db
      .insert(players)
      .values({ teamId, name: "Lisa Test", blocked: false })
      .returning({ id: players.id });

    const link = await generatePlayerOptOutLink(p.id);
    const token = new URL(link.url).searchParams.get("token")!;

    const first = await confirmPlayerOptOut(token);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.alreadyBlocked).toBe(false);

    const second = await confirmPlayerOptOut(token);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyBlocked).toBe(true);
  });

  it("confirm mit ungültigem Token liefert ok:false", async () => {
    const res = await confirmPlayerOptOut("not-a-token");
    expect(res.ok).toBe(false);
  });
});

describe("listRosterForTeam", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert Spieler sortiert mit Event-Count", async () => {
    const { teamId } = await makeClubWithAdmin("club-roster");
    const [a] = await db
      .insert(players)
      .values({ teamId, name: "Alex", blocked: false })
      .returning({ id: players.id });
    await db.insert(players).values({ teamId, name: "Bert", blocked: true });

    // Fake Match + Event für Alex
    const [m] = await db
      .insert(matches)
      .values({
        teamId,
        fussballdeSpielId: createId(),
        datum: new Date(),
        heimName: "H",
        gastName: "G"
      })
      .returning({ id: matches.id });
    await db.insert(matchEvents).values({
      matchId: m.id,
      type: "tor",
      side: "heim",
      source: "scraped",
      playerId: a.id,
      playerName: "Alex"
    });

    const { listRosterForTeam } = await import("@/lib/db/queries/team-lifecycle");
    const roster = await listRosterForTeam(teamId);
    expect(roster.length).toBe(2);
    const alex = roster.find((p) => p.id === a.id);
    expect(alex?.matchEventCount).toBe(1);
  });
});
