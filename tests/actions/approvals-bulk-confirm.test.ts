/**
 * confirmApprovals — Batch-Bestätigung (Tier-3-Usability-Fix).
 *
 * Manual-Teams (coverage=none) erzeugen PRO Tor + pro Outcome eine eigene
 * Approval-Zeile. Ein 8:0 mit „2 €/Tor + 5 €/Sieg" = 9 Inbox-Einträge, bisher
 * 9-mal einzeln zu bestätigen. `confirmApprovals(ids[])` bestätigt eine ganze
 * Spiel-Gruppe in einem Rutsch — mit denselben Tenant-/Status-/Widerruf-
 * Garantien wie das Einzel-`confirmApproval`.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUserId } = vi.hoisted(() => ({ mockUserId: { current: "u_bulk" } }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: "bulk@example.com"
  }))
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

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
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { confirmApprovals } from "@/lib/actions/approvals";

interface SeededApproval {
  approvalId: string;
}

/** Legt Basis-Entities + ein Match an; gibt eine Factory für Event/Charge/Approval zurück. */
async function seedMatch(opts: {
  userId: string;
  sponsorSuffix: string;
}) {
  const db = await getTestDb();
  await db
    .insert(users)
    .values({ id: opts.userId, email: `${opts.userId}@example.com` })
    .onConflictDoNothing();
  await db
    .insert(clubs)
    .values({ id: `c_${opts.sponsorSuffix}`, slug: `bulk-${opts.sponsorSuffix}`, name: "Bulk FC" })
    .onConflictDoNothing();
  const [team] = await db
    .insert(teams)
    .values({
      clubId: `c_${opts.sponsorSuffix}`,
      name: "E-Jugend",
      saison: "2526",
      fussballdeTeamId: `TEAM_${opts.sponsorSuffix}`,
      isActive: true
    })
    .returning();
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: opts.userId, displayName: `Sponsor ${opts.sponsorSuffix}`, type: "familie" })
    .returning();
  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: "active",
      startsAt: new Date("2025-08-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T23:59:59Z")
    })
    .returning();
  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      fussballdeSpielId: `fs_${opts.sponsorSuffix}`,
      datum: new Date("2026-06-01T13:00:00Z"),
      heimName: "Bulk FC",
      gastName: "SV Gegner",
      ergebnisHeim: 8,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();

  let n = 0;
  async function addApproval(withPendingCharge = true): Promise<SeededApproval> {
    n += 1;
    const [rule] = await db
      .insert(pledgeRules)
      .values({
        pledgeId: pledge.id,
        triggerType: "goal_total",
        triggerParamsJson: {},
        amountCents: 200,
        requiresApproval: true
      })
      .returning();
    const [event] = await db
      .insert(matchEvents)
      .values({
        matchId: match.id,
        minute: 10 + n,
        type: "tor",
        side: "heim",
        source: "manual"
      })
      .returning();
    if (withPendingCharge) {
      await db.insert(charges).values({
        pledgeId: pledge.id,
        pledgeRuleId: rule.id,
        matchId: match.id,
        matchEventId: event.id,
        triggerType: "goal_total",
        amountCents: 200,
        status: "pending_approval"
      });
    }
    const [approval] = await db
      .insert(eventApprovals)
      .values({
        matchEventId: event.id,
        pledgeRuleId: rule.id,
        status: "pending",
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      })
      .returning();
    return { approvalId: approval.id };
  }

  return { addApproval };
}

describe.skipIf(isIntegrationDbDisabled)("confirmApprovals (Batch)", () => {
  beforeEach(async () => {
    await resetTestDb();
    mockUserId.current = "u_bulk";
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("bestätigt eine ganze Spiel-Gruppe in einem Aufruf", async () => {
    const db = await getTestDb();
    const { addApproval } = await seedMatch({ userId: "u_bulk", sponsorSuffix: "own" });
    const a = await addApproval();
    const b = await addApproval();
    const c = await addApproval();

    const result = await confirmApprovals([a.approvalId, b.approvalId, c.approvalId]);

    expect(result).toEqual({ ok: true, confirmed: 3 });
    const rows = await db.select().from(charges);
    expect(rows.filter((r) => r.status === "confirmed")).toHaveLength(3);
    const apprs = await db.select().from(eventApprovals);
    expect(apprs.every((r) => r.status === "confirmed")).toBe(true);
  });

  it("überspringt fremde Approvals (Tenant-Isolation), bestätigt nur die eigenen", async () => {
    const db = await getTestDb();
    const own = await seedMatch({ userId: "u_bulk", sponsorSuffix: "own" });
    const other = await seedMatch({ userId: "u_other", sponsorSuffix: "other" });
    const mine = await own.addApproval();
    const foreign = await other.addApproval();

    const result = await confirmApprovals([mine.approvalId, foreign.approvalId]);

    expect(result).toEqual({ ok: true, confirmed: 1 });
    const apprs = await db.select().from(eventApprovals);
    const confirmed = apprs.filter((r) => r.status === "confirmed");
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].id).toBe(mine.approvalId);
  });

  it("überspringt zwischenzeitlich widerrufene Events (kein pending Charge)", async () => {
    const db = await getTestDb();
    const { addApproval } = await seedMatch({ userId: "u_bulk", sponsorSuffix: "own" });
    const live = await addApproval(true);
    const withdrawn = await addApproval(false);

    const result = await confirmApprovals([live.approvalId, withdrawn.approvalId]);

    expect(result).toEqual({ ok: true, confirmed: 1 });
    const apprs = await db.select().from(eventApprovals);
    const byId = new Map(apprs.map((r) => [r.id, r.status]));
    expect(byId.get(live.approvalId)).toBe("confirmed");
    expect(byId.get(withdrawn.approvalId)).toBe("pending");
  });
});
