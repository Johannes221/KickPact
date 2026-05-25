import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges,
  eventApprovals
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  getEditableMatchEvent,
  updateMatchEvent,
  deleteMatchEvent,
  overrideMatchResultQuery
} from "@/lib/db/queries/match-events-edit";

/**
 * Plan 3 Teil 2: Integration-Tests gegen die Match-Event-Edit-Queries.
 *
 * Deckt:
 *   - getEditableMatchEvent liefert Tree
 *   - updateMatchEvent invalidiert Charges + Approvals + Audit
 *   - deleteMatchEvent löscht hart + Charges cancelled + Approvals expired
 *   - deleteMatchEvent blockt wenn invoiced charges hängen
 *   - overrideMatchResultQuery setzt result + cancelled charges + Audit
 *   - Audit-Trail append-only auch bei mehreren Aktionen
 */

async function seedMatchWithEvent(opts: {
  withCharge?: boolean;
  withApproval?: boolean;
  chargeStatus?: "confirmed" | "pending_approval" | "invoiced";
} = {}) {
  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@test.local`,
    emailVerified: true,
    name: "Test",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${userId.slice(0, 6)}`,
      name: "Test Club",
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id });

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

  const sponsorUserId = createId();
  await db.insert(users).values({
    id: sponsorUserId,
    email: `${sponsorUserId}@test.local`,
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
      subtype: null,
      side: "heim",
      playerName: "Max",
      source: "scraped"
    })
    .returning({ id: matchEvents.id });

  let chargeId: string | null = null;
  if (opts.withCharge) {
    const [c] = await db
      .insert(charges)
      .values({
        pledgeId: pledge.id,
        pledgeRuleId: rule.id,
        matchId: match.id,
        matchEventId: event.id,
        triggerType: "goal_total",
        amountCents: 500,
        status: opts.chargeStatus ?? "confirmed",
        confirmedAt: opts.chargeStatus !== "pending_approval" ? new Date() : null
      })
      .returning({ id: charges.id });
    chargeId = c.id;
  }

  let approvalId: string | null = null;
  if (opts.withApproval) {
    const [a] = await db
      .insert(eventApprovals)
      .values({
        matchEventId: event.id,
        pledgeRuleId: rule.id,
        status: "pending",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      })
      .returning({ id: eventApprovals.id });
    approvalId = a.id;
  }

  return {
    userId,
    clubId: club.id,
    teamId: team.id,
    sponsorId: sponsor.id,
    pledgeId: pledge.id,
    ruleId: rule.id,
    matchId: match.id,
    eventId: event.id,
    chargeId,
    approvalId
  };
}

describe("getEditableMatchEvent", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert Event + Match + Charges + Approvals", async () => {
    const seed = await seedMatchWithEvent({
      withCharge: true,
      withApproval: true,
      chargeStatus: "confirmed"
    });
    const tree = await getEditableMatchEvent(seed.eventId);
    expect(tree).not.toBeNull();
    expect(tree!.event.id).toBe(seed.eventId);
    expect(tree!.match.id).toBe(seed.matchId);
    expect(tree!.charges.length).toBe(1);
    expect(tree!.approvals.length).toBe(1);
  });

  it("returnt null wenn Event nicht existiert", async () => {
    const tree = await getEditableMatchEvent("nope");
    expect(tree).toBeNull();
  });
});

describe("updateMatchEvent", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("updated Felder + invalidiert Charges + expired Approvals + Audit-Trail", async () => {
    const seed = await seedMatchWithEvent({
      withCharge: true,
      withApproval: true,
      chargeStatus: "confirmed"
    });

    const res = await updateMatchEvent(
      seed.eventId,
      { minute: 42, playerName: "Anna" },
      seed.userId
    );

    expect(res.invalidatedCharges).toBe(1);
    expect(res.expiredApprovals).toBe(1);

    const [after] = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, seed.eventId));
    expect(after.minute).toBe(42);
    expect(after.playerName).toBe("Anna");

    const [chargeAfter] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, seed.chargeId!));
    expect(chargeAfter.status).toBe("cancelled");
    expect(chargeAfter.cancelledReason).toBe("event-edited");

    const [approvalAfter] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, seed.approvalId!));
    expect(approvalAfter.status).toBe("expired");

    const [matchAfter] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, seed.matchId));
    expect(matchAfter.adminNote).toBeTruthy();
    const parsed = JSON.parse(matchAfter.adminNote!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].kind).toBe("event-edited");
    expect(parsed[0].snapshot.minute).toBe(23);
    expect(parsed[0].snapshot.playerName).toBe("Max");
    expect(parsed[0].byUserId).toBe(seed.userId);
  });

  it("lässt invoiced Charges in Ruhe", async () => {
    const seed = await seedMatchWithEvent({
      withCharge: true,
      chargeStatus: "invoiced"
    });
    const res = await updateMatchEvent(
      seed.eventId,
      { minute: 60 },
      seed.userId
    );
    expect(res.invalidatedCharges).toBe(0);
    const [chargeAfter] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, seed.chargeId!));
    expect(chargeAfter.status).toBe("invoiced");
  });

  it("wirft wenn Event nicht existiert", async () => {
    await expect(
      updateMatchEvent("nope", { minute: 5 }, "user-x")
    ).rejects.toThrow(/nicht gefunden/);
  });
});

describe("deleteMatchEvent", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("löscht Event hart, Charges cancelled, Approvals expired (FK-cascade), Audit", async () => {
    const seed = await seedMatchWithEvent({
      withCharge: true,
      withApproval: true,
      chargeStatus: "confirmed"
    });

    const res = await deleteMatchEvent(seed.eventId, seed.userId);
    expect(res.invalidatedCharges).toBe(1);

    const after = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, seed.eventId));
    expect(after.length).toBe(0); // hard-deleted

    // event_approvals FK cascadet
    const approvalsAfter = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, seed.approvalId!));
    expect(approvalsAfter.length).toBe(0);

    // charges: FK ON DELETE SET NULL → row bleibt, matchEventId=null,
    // status=cancelled, reason=event-deleted
    const [chargeAfter] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, seed.chargeId!));
    expect(chargeAfter.status).toBe("cancelled");
    expect(chargeAfter.cancelledReason).toBe("event-deleted");
    expect(chargeAfter.matchEventId).toBeNull();

    // Audit-Trail enthält Snapshot
    const [matchAfter] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, seed.matchId));
    const parsed = JSON.parse(matchAfter.adminNote!);
    expect(parsed[0].kind).toBe("event-deleted");
    expect(parsed[0].snapshot.minute).toBe(23);
    expect(parsed[0].snapshot.source).toBe("scraped");
  });

  it("blockt Delete wenn invoiced Charge hängt", async () => {
    const seed = await seedMatchWithEvent({
      withCharge: true,
      chargeStatus: "invoiced"
    });
    await expect(deleteMatchEvent(seed.eventId, seed.userId)).rejects.toThrow(
      /Rechnung/i
    );
    const after = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, seed.eventId));
    expect(after.length).toBe(1); // nicht gelöscht
  });
});

describe("overrideMatchResultQuery", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("setzt neues Ergebnis + cancelt non-invoiced Charges + Audit-Trail", async () => {
    const seed = await seedMatchWithEvent({
      withCharge: true,
      chargeStatus: "confirmed"
    });

    const res = await overrideMatchResultQuery(
      seed.matchId,
      { ergebnisHeim: 5, ergebnisGast: 0, halbzeitHeim: 3, halbzeitGast: 0 },
      "Crawler hat Tor nicht erkannt",
      seed.userId
    );

    expect(res.invalidatedCharges).toBe(1);

    const [matchAfter] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, seed.matchId));
    expect(matchAfter.ergebnisHeim).toBe(5);
    expect(matchAfter.ergebnisGast).toBe(0);
    expect(matchAfter.halbzeitHeim).toBe(3);
    const note = JSON.parse(matchAfter.adminNote!);
    expect(note[0].kind).toBe("result-override");
    expect(note[0].reason).toBe("Crawler hat Tor nicht erkannt");
    expect(note[0].snapshot.ergebnisHeim).toBe(2);
    expect(note[0].snapshot.ergebnisGast).toBe(1);

    const [chargeAfter] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, seed.chargeId!));
    expect(chargeAfter.status).toBe("cancelled");
    expect(chargeAfter.cancelledReason).toBe("result-override");
  });

  it("Audit-Trail ist append-only über mehrere Aktionen", async () => {
    const seed = await seedMatchWithEvent({ withCharge: false });

    await overrideMatchResultQuery(
      seed.matchId,
      { ergebnisHeim: 3, ergebnisGast: 2 },
      "Erstkorrektur",
      seed.userId
    );
    await overrideMatchResultQuery(
      seed.matchId,
      { ergebnisHeim: 4, ergebnisGast: 2 },
      "Zweitkorrektur",
      seed.userId
    );

    const [matchAfter] = await db
      .select()
      .from(matches)
      .where(eq(matches.id, seed.matchId));
    const note = JSON.parse(matchAfter.adminNote!);
    expect(Array.isArray(note)).toBe(true);
    expect(note.length).toBe(2);
    expect(note[0].reason).toBe("Erstkorrektur");
    expect(note[1].reason).toBe("Zweitkorrektur");
    // Snapshot des 2. Eintrags zeigt die Werte NACH der ersten Korrektur
    expect(note[1].snapshot.ergebnisHeim).toBe(3);
    expect(note[1].snapshot.ergebnisGast).toBe(2);
  });

  it("wirft wenn Match nicht existiert", async () => {
    await expect(
      overrideMatchResultQuery(
        "nope",
        { ergebnisHeim: 1, ergebnisGast: 0 },
        "test",
        "u1"
      )
    ).rejects.toThrow(/nicht gefunden/);
  });
});
