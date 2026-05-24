/**
 * Integration tests for the approval lifecycle.
 *
 * Covers the four state transitions a pending event_approval can go through:
 *   1. pending → confirmed: confirmed charge follows
 *   2. pending → disputed: paired charge becomes cancelled
 *   3. reminder cadence: 7/14/30-day cadence increments reminder_count
 *   4. auto-expire: after expires_at, status=expired + charge=cancelled
 *
 * The real callers (`confirmApproval`, `disputeApproval` in
 * `lib/actions/approvals.ts`) are server actions requiring auth context, so
 * cases (1) + (2) execute the same DB transitions directly against the test
 * DB to keep the test free of Next.js request scaffolding. The reminder +
 * expire cases drive primitive DB updates that the inngest scheduler would
 * otherwise perform; the actual inngest entry points (
 * `approval-reminders.ts`, `expireApprovals`) are not exported as plain
 * helpers yet and stay behind `it.skip` placeholders to be flipped once the
 * Phase 4 extraction lands.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, lt, sql } from "drizzle-orm";
import {
  charges,
  eventApprovals,
  matchEvents,
  matches
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";
import {
  seedClubFromFixture,
  seedSponsorWithPledge
} from "../../fixtures/scraper/seed-from-fixtures";

interface PendingSetup {
  approvalId: string;
  matchEventId: string;
  pledgeRuleId: string;
  pledgeId: string;
  chargeId: string;
}

/**
 * Sets up a fully-formed pending approval: club + team + sponsor + pledge
 * with requiresApproval=true, plus a manual match_event, a paired
 * charge(status=pending_approval), and the event_approvals row referencing
 * both. Tests then drive transitions on top of this base state.
 */
async function setupPendingApproval(opts: {
  sponsorKey: string;
  createdAt?: Date;
  expiresAt?: Date;
}): Promise<PendingSetup> {
  const db = await getTestDb();
  const { teamIds } = await seedClubFromFixture("dossenheim");
  const { pledgeId, ruleId } = await seedSponsorWithPledge({
    sponsorKey: opts.sponsorKey,
    teamDbId: teamIds.herren1!,
    triggerType: "special_goal",
    amountCents: 500,
    requiresApproval: true
  });

  const [m] = await db
    .insert(matches)
    .values({
      teamId: teamIds.herren1!,
      fussballdeSpielId: `SPIEL_${opts.sponsorKey}`,
      datum: new Date("2026-05-10T15:00:00Z"),
      heimName: "FC Sportfreunde",
      gastName: "TSV Test",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  const [ev] = await db
    .insert(matchEvents)
    .values({
      matchId: m!.id,
      type: "spezial",
      subtype: "hackentor",
      minute: 67,
      side: "heim",
      playerName: "Lukas Wagner",
      source: "manual"
    })
    .returning();
  const [ch] = await db
    .insert(charges)
    .values({
      pledgeId,
      pledgeRuleId: ruleId,
      matchId: m!.id,
      matchEventId: ev!.id,
      triggerType: "special_goal",
      amountCents: 500,
      status: "pending_approval"
    })
    .returning();
  const [ap] = await db
    .insert(eventApprovals)
    .values({
      matchEventId: ev!.id,
      pledgeRuleId: ruleId,
      status: "pending",
      expiresAt:
        opts.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {})
    })
    .returning();

  return {
    approvalId: ap!.id,
    matchEventId: ev!.id,
    pledgeRuleId: ruleId,
    pledgeId,
    chargeId: ch!.id
  };
}

describe.skipIf(isIntegrationDbDisabled)("approval lifecycle", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("pending → confirmed: charge becomes confirmed", async () => {
    const db = await getTestDb();
    const setup = await setupPendingApproval({ sponsorKey: "confirm" });

    // Mirrors lib/actions/approvals.ts → confirmApproval body
    await db.transaction(async (tx) => {
      await tx
        .update(eventApprovals)
        .set({ status: "confirmed", respondedAt: new Date() })
        .where(eq(eventApprovals.id, setup.approvalId));
      await tx
        .update(charges)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(
          and(
            eq(charges.pledgeRuleId, setup.pledgeRuleId),
            eq(charges.matchEventId, setup.matchEventId),
            eq(charges.status, "pending_approval")
          )
        );
    });

    const [ap] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, setup.approvalId));
    expect(ap?.status).toBe("confirmed");
    expect(ap?.respondedAt).not.toBeNull();

    const [ch] = await db
      .select()
      .from(charges)
      .where(eq(charges.matchEventId, setup.matchEventId));
    expect(ch?.status).toBe("confirmed");
    expect(ch?.confirmedAt).not.toBeNull();
  });

  it("pending → disputed: charge becomes cancelled with reason", async () => {
    const db = await getTestDb();
    const setup = await setupPendingApproval({ sponsorKey: "dispute" });

    // Mirrors lib/actions/approvals.ts → disputeApproval body
    await db.transaction(async (tx) => {
      await tx
        .update(eventApprovals)
        .set({
          status: "disputed",
          respondedAt: new Date(),
          disputeReason: "wrong subtype"
        })
        .where(eq(eventApprovals.id, setup.approvalId));
      await tx
        .update(charges)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(charges.pledgeRuleId, setup.pledgeRuleId),
            eq(charges.matchEventId, setup.matchEventId),
            eq(charges.status, "pending_approval")
          )
        );
    });

    const [ap] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, setup.approvalId));
    expect(ap?.status).toBe("disputed");
    expect(ap?.disputeReason).toBe("wrong subtype");

    const [ch] = await db
      .select()
      .from(charges)
      .where(eq(charges.matchEventId, setup.matchEventId));
    expect(ch?.status).toBe("cancelled");
  });

  it("reminder cadence: 7d threshold increments reminder_count", async () => {
    const db = await getTestDb();
    // approval created 8 days ago → eligible for first reminder
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const setup = await setupPendingApproval({
      sponsorKey: "remind1",
      createdAt: eightDaysAgo
    });

    // Mirrors the update batch inside approval-reminders.ts
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const updated = await db
      .update(eventApprovals)
      .set({
        lastRemindedAt: new Date(),
        reminderCount: sql`${eventApprovals.reminderCount} + 1`
      })
      .where(
        and(
          eq(eventApprovals.id, setup.approvalId),
          eq(eventApprovals.status, "pending"),
          lt(eventApprovals.createdAt, sevenDaysAgo)
        )
      )
      .returning({ id: eventApprovals.id });
    expect(updated).toHaveLength(1);

    const [ap1] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, setup.approvalId));
    expect(ap1?.reminderCount).toBe(1);
    expect(ap1?.lastRemindedAt).not.toBeNull();

    // A second update simulating the next cadence pass — count grows.
    await db
      .update(eventApprovals)
      .set({
        lastRemindedAt: new Date(),
        reminderCount: sql`${eventApprovals.reminderCount} + 1`
      })
      .where(eq(eventApprovals.id, setup.approvalId));

    const [ap2] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, setup.approvalId));
    expect(ap2?.reminderCount).toBe(2);
  });

  it("reminder cadence: createdAt < 7d → no candidates picked up", async () => {
    const db = await getTestDb();
    // Only 2 days old → reminder pass must skip it.
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const setup = await setupPendingApproval({
      sponsorKey: "no-remind",
      createdAt: twoDaysAgo
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const updated = await db
      .update(eventApprovals)
      .set({
        lastRemindedAt: new Date(),
        reminderCount: sql`${eventApprovals.reminderCount} + 1`
      })
      .where(
        and(
          eq(eventApprovals.id, setup.approvalId),
          eq(eventApprovals.status, "pending"),
          lt(eventApprovals.createdAt, sevenDaysAgo)
        )
      )
      .returning({ id: eventApprovals.id });
    expect(updated).toHaveLength(0);

    const [ap] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, setup.approvalId));
    expect(ap?.reminderCount).toBe(0);
  });

  it("auto-expire after expires_at: status=expired, charge=cancelled", async () => {
    const db = await getTestDb();
    const setup = await setupPendingApproval({
      sponsorKey: "expire",
      expiresAt: new Date(Date.now() - 60 * 1000) // already past
    });

    // Simulates the expire-pass: all `pending` approvals past expires_at
    // transition to `expired`; their paired pending_approval charge → cancelled.
    await db.transaction(async (tx) => {
      const stale = await tx
        .select()
        .from(eventApprovals)
        .where(
          and(
            eq(eventApprovals.status, "pending"),
            lt(eventApprovals.expiresAt, new Date())
          )
        );

      for (const row of stale) {
        await tx
          .update(eventApprovals)
          .set({ status: "expired", respondedAt: new Date() })
          .where(eq(eventApprovals.id, row.id));
        await tx
          .update(charges)
          .set({ status: "cancelled" })
          .where(
            and(
              eq(charges.pledgeRuleId, row.pledgeRuleId),
              eq(charges.matchEventId, row.matchEventId),
              eq(charges.status, "pending_approval")
            )
          );
      }
    });

    const [ap] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, setup.approvalId));
    expect(ap?.status).toBe("expired");

    const [ch] = await db
      .select()
      .from(charges)
      .where(eq(charges.matchEventId, setup.matchEventId));
    expect(ch?.status).toBe("cancelled");
  });

  it("already-resolved approval is not re-expired", async () => {
    const db = await getTestDb();
    const setup = await setupPendingApproval({
      sponsorKey: "no-double-expire",
      expiresAt: new Date(Date.now() - 60 * 1000)
    });
    // Confirm first.
    await db.transaction(async (tx) => {
      await tx
        .update(eventApprovals)
        .set({ status: "confirmed", respondedAt: new Date() })
        .where(eq(eventApprovals.id, setup.approvalId));
      await tx
        .update(charges)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(eq(charges.id, setup.chargeId));
    });

    // Run the expire pass — the where-clause requires status='pending' so
    // confirmed approvals are untouched.
    const stale = await db
      .select()
      .from(eventApprovals)
      .where(
        and(
          eq(eventApprovals.status, "pending"),
          lt(eventApprovals.expiresAt, new Date())
        )
      );
    expect(stale).toHaveLength(0);

    const [ap] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, setup.approvalId));
    expect(ap?.status).toBe("confirmed");
  });

  it.skip("requires phase 4 merge: confirmApproval/disputeApproval via real entry points", async () => {
    // Phase 4 will either lift the server-action body into a plain helper
    // (e.g. lib/db/queries/approvals.ts::confirmApproval(approvalId)) or
    // expose an inngest-callable runner. Once available, swap the inline
    // transactions above for the real call site so the action's tenant +
    // status guards are exercised end-to-end.
    expect(true).toBe(true);
  });
});
