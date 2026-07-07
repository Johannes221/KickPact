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

// Stub inngest.send — wir asserten nicht auf Inngest-Schedule selbst,
// nur darauf dass die Action es triggert.
const { inngestSendMock } = vi.hoisted(() => ({
  inngestSendMock: vi.fn().mockResolvedValue({ ids: ["evt"] })
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: inngestSendMock
  }
}));

import { db } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  teamLicenses,
  subscriptions,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  editMatchEventAction,
  deleteMatchEventAction,
  overrideMatchResultAction
} from "@/lib/actions/match-events-edit";

async function seedWithUser(role: "admin" | "trainer" | "viewer" = "trainer") {
  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@kickpact.local`,
    emailVerified: true,
    name: "Test",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  mockUserId.current = userId;

  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${userId.slice(0, 6)}`,
      name: "Test Club",
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id, slug: clubs.slug });
  await db.insert(clubMemberships).values({
    userId,
    clubId: club.id,
    role
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
      fussballdeTeamId: `T_${userId.slice(0, 6)}`,
      isActive: true
    })
    .returning({ id: teams.id });
  await db.insert(teamLicenses).values({
    subscriptionClubId: club.id,
    teamId: team.id,
    plan: "pro",
    status: "trialing"
  });

  const sponsorUserId = createId();
  await db.insert(users).values({
    id: sponsorUserId,
    email: `${sponsorUserId}@kickpact.local`,
    emailVerified: true,
    name: "Sponsor",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const [sponsor] = await db
    .insert(sponsors)
    .values({
      userId: sponsorUserId,
      displayName: "ACME",
      type: "familie"
    })
    .returning({ id: sponsors.id });

  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: "active",
      startsAt: new Date(2025, 6, 1),
      endsAt: new Date(2026, 5, 30)
    })
    .returning({ id: pledges.id });
  const [rule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      amountCents: 500,
      requiresApproval: false
    })
    .returning({ id: pledgeRules.id });

  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      fussballdeSpielId: `S_${createId()}`,
      datum: new Date(2026, 0, 15),
      heimName: "1. Herren Test",
      gastName: "Gegner",
      ergebnisHeim: 2,
      ergebnisGast: 1,
      status: "finished"
    })
    .returning({ id: matches.id });
  const [event] = await db
    .insert(matchEvents)
    .values({
      matchId: match.id,
      minute: 23,
      type: "tor",
      side: "heim",
      playerName: "Max",
      source: "scraped"
    })
    .returning({ id: matchEvents.id });
  const [charge] = await db
    .insert(charges)
    .values({
      pledgeId: pledge.id,
      pledgeRuleId: rule.id,
      matchId: match.id,
      matchEventId: event.id,
      triggerType: "goal_total",
      amountCents: 500,
      status: "confirmed",
      confirmedAt: new Date()
    })
    .returning({ id: charges.id });

  return {
    userId,
    clubSlug: club.slug,
    clubId: club.id,
    teamId: team.id,
    matchId: match.id,
    eventId: event.id,
    chargeId: charge.id
  };
}

/**
 * Saison-Pass in Sommerpause (paused). paused ist read-only, chargt aber
 * weiter (Juni-Charges bis 30.6.) — daher MÜSSEN die Fehl-Korrektur-Actions
 * hier durchlaufen, konsistent mit setSeasonResult (…AllowPaused).
 */
async function setPaused(clubId: string) {
  await db
    .update(subscriptions)
    .set({ status: "paused" })
    .where(eq(subscriptions.clubId, clubId));
}

describe("editMatchEventAction", () => {
  beforeEach(async () => {
    await resetTestDb();
    inngestSendMock.mockClear();
  });

  it("updated Event + cancelt Charge + feuert match/finished", async () => {
    const seed = await seedWithUser("trainer");
    const result = await editMatchEventAction({
      matchEventId: seed.eventId,
      minute: 45,
      playerName: "Tom"
    });
    if (!result.ok) throw new Error(`unexpected: ${result.message}`);
    expect(result.invalidatedCharges).toBe(1);
    expect(result.matchId).toBe(seed.matchId);

    const [evt] = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, seed.eventId));
    expect(evt.minute).toBe(45);
    expect(evt.playerName).toBe("Tom");

    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "match/finished",
      data: { matchId: seed.matchId, teamId: seed.teamId }
    });
  });

  it("wirft mit viewer-Permission", async () => {
    const seed = await seedWithUser("viewer");
    await expect(
      editMatchEventAction({ matchEventId: seed.eventId, minute: 1 })
    ).rejects.toThrow();
  });

  it("paused: Fehl-Korrektur bleibt in der Sommerpause möglich", async () => {
    const seed = await seedWithUser("trainer");
    await setPaused(seed.clubId);
    const result = await editMatchEventAction({
      matchEventId: seed.eventId,
      minute: 12
    });
    if (!result.ok) throw new Error(`unexpected: ${result.message}`);
    expect(result.matchId).toBe(seed.matchId);
  });

  it("M1: Minuten-Korrektur an Legacy-Subtype-Event bleibt möglich (subtype unverändert)", async () => {
    const seed = await seedWithUser("trainer");
    // Bestands-Event mit Alt-Subtype, der nicht mehr in SPECIAL_GOAL_SUBTYPES ist.
    await db
      .update(matchEvents)
      .set({ type: "spezial", subtype: "volley" })
      .where(eq(matchEvents.id, seed.eventId));

    const result = await editMatchEventAction({
      matchEventId: seed.eventId,
      minute: 77,
      subtype: "volley" // Formular sendet den Bestand immer mit
    });
    if (!result.ok) throw new Error(`unexpected: ${result.message}`);
    const [evt] = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, seed.eventId));
    expect(evt.minute).toBe(77);
  });

  it("M1: ÄNDERUNG auf unbekannten Subtype wird mit {ok:false,message} abgelehnt", async () => {
    const seed = await seedWithUser("trainer");
    await db
      .update(matchEvents)
      .set({ type: "spezial", subtype: "fallrueckzieher" })
      .where(eq(matchEvents.id, seed.eventId));

    const result = await editMatchEventAction({
      matchEventId: seed.eventId,
      subtype: "banana-kick"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Unbekannter Spezialtor-Typ/);
    }
  });
});

describe("deleteMatchEventAction", () => {
  beforeEach(async () => {
    await resetTestDb();
    inngestSendMock.mockClear();
  });

  it("löscht Event + cancelt Charge + triggert Re-Eval", async () => {
    const seed = await seedWithUser("trainer");
    const result = await deleteMatchEventAction({ matchEventId: seed.eventId });
    expect(result.invalidatedCharges).toBe(1);
    expect(result.matchId).toBe(seed.matchId);

    const after = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, seed.eventId));
    expect(after.length).toBe(0);

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
  });

  it("wirft mit viewer-Permission", async () => {
    const seed = await seedWithUser("viewer");
    await expect(
      deleteMatchEventAction({ matchEventId: seed.eventId })
    ).rejects.toThrow();
  });

  it("paused: Event-Löschung bleibt in der Sommerpause möglich", async () => {
    const seed = await seedWithUser("trainer");
    await setPaused(seed.clubId);
    const result = await deleteMatchEventAction({ matchEventId: seed.eventId });
    expect(result.matchId).toBe(seed.matchId);
    const after = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, seed.eventId));
    expect(after.length).toBe(0);
  });
});

describe("overrideMatchResultAction", () => {
  beforeEach(async () => {
    await resetTestDb();
    inngestSendMock.mockClear();
  });

  it("setzt result + audit + triggert Re-Eval", async () => {
    const seed = await seedWithUser("trainer");
    const result = await overrideMatchResultAction({
      matchId: seed.matchId,
      ergebnisHeim: 4,
      ergebnisGast: 0,
      reason: "Crawler-Fehler beim Tor-Erkennen"
    });
    expect(result.matchId).toBe(seed.matchId);

    const [m] = await db.select().from(matches).where(eq(matches.id, seed.matchId));
    expect(m.ergebnisHeim).toBe(4);
    expect(m.ergebnisGast).toBe(0);
    const note = JSON.parse(m.adminNote!);
    expect(note[0].kind).toBe("result-override");

    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "match/finished",
      data: { matchId: seed.matchId, teamId: seed.teamId }
    });
  });

  it("validiert Reason min-length", async () => {
    const seed = await seedWithUser("trainer");
    await expect(
      overrideMatchResultAction({
        matchId: seed.matchId,
        ergebnisHeim: 2,
        ergebnisGast: 1,
        reason: "ab"
      })
    ).rejects.toThrow();
  });

  it("wirft mit viewer-Permission", async () => {
    const seed = await seedWithUser("viewer");
    await expect(
      overrideMatchResultAction({
        matchId: seed.matchId,
        ergebnisHeim: 3,
        ergebnisGast: 1,
        reason: "test reason"
      })
    ).rejects.toThrow();
  });

  it("paused: Ergebnis-Override bleibt in der Sommerpause möglich", async () => {
    const seed = await seedWithUser("trainer");
    await setPaused(seed.clubId);
    const result = await overrideMatchResultAction({
      matchId: seed.matchId,
      ergebnisHeim: 0,
      ergebnisGast: 3,
      reason: "Crawler übernahm 3:0 statt 0:3 (Relegation)"
    });
    expect(result.matchId).toBe(seed.matchId);
    const [m] = await db.select().from(matches).where(eq(matches.id, seed.matchId));
    expect(m.ergebnisHeim).toBe(0);
    expect(m.ergebnisGast).toBe(3);
  });
});
