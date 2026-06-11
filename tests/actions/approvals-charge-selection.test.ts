/**
 * confirmApproval-Charge-Selektion (Audit 2026-06-11 / Phase 2 / C4).
 *
 * Nach Invalidate+Re-Eval existieren für (pledgeRuleId, matchEventId) ZWEI
 * Charges: die alte (cancelled) und die neue (pending_approval). Der
 * Cancelled-Guard in confirmApproval las bisher ungeordnet `LIMIT 1` — traf
 * er die stornierte Zeile, konnte der Sponsor die legitime neue Charge nie
 * bestätigen. Fix: Selektion mit status='pending_approval' + ORDER BY
 * createdAt DESC.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const { mockUserId } = vi.hoisted(() => ({ mockUserId: { current: "u_ap" } }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: "ap@example.com"
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
import { confirmApproval } from "@/lib/actions/approvals";

async function seedPair(opts: { withPendingCharge: boolean }) {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_ap", email: "ap@example.com" });
  await db.insert(clubs).values({ id: "c_ap", slug: "ap-fc", name: "Approval FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_ap",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_AP",
      isActive: true
    })
    .returning();
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: "u_ap", displayName: "Sponsor AP", type: "familie" })
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
  const [pledgeRule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "special_goal",
      triggerParamsJson: {},
      amountCents: 700,
      requiresApproval: true
    })
    .returning();
  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      fussballdeSpielId: "fs_ap_1",
      datum: new Date("2026-06-01T13:00:00Z"),
      heimName: "Approval FC",
      gastName: "SV Gegner",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  const [event] = await db
    .insert(matchEvents)
    .values({
      matchId: match.id,
      minute: 12,
      type: "spezial",
      subtype: "freistosstor",
      side: "heim",
      source: "manual"
    })
    .returning();

  // ZUERST die stornierte Alt-Charge (physisch erste Zeile) …
  await db.insert(charges).values({
    pledgeId: pledge.id,
    pledgeRuleId: pledgeRule.id,
    matchId: match.id,
    matchEventId: event.id,
    triggerType: "special_goal",
    amountCents: 700,
    status: "cancelled",
    cancelledReason: "match_updated",
    createdAt: new Date(Date.now() - 60 * 60 * 1000)
  });
  // … dann (optional) die neue pending-Charge aus der Re-Evaluation.
  if (opts.withPendingCharge) {
    await db.insert(charges).values({
      pledgeId: pledge.id,
      pledgeRuleId: pledgeRule.id,
      matchId: match.id,
      matchEventId: event.id,
      triggerType: "special_goal",
      amountCents: 700,
      status: "pending_approval"
    });
  }

  const [approval] = await db
    .insert(eventApprovals)
    .values({
      matchEventId: event.id,
      pledgeRuleId: pledgeRule.id,
      status: "pending",
      expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    })
    .returning();
  return { approvalId: approval.id };
}

describe.skipIf(isIntegrationDbDisabled)("confirmApproval Charge-Selektion (C4)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("cancelled+pending-Paar: Bestätigen trifft die NEUE pending-Charge", async () => {
    const db = await getTestDb();
    const { approvalId } = await seedPair({ withPendingCharge: true });

    const result = await confirmApproval(approvalId);
    expect(result.ok).toBe(true);

    const rows = await db.select().from(charges);
    expect(rows.filter((c) => c.status === "confirmed")).toHaveLength(1);
    expect(rows.filter((c) => c.status === "cancelled")).toHaveLength(1);
  });

  it("nur cancelled-Charge (kein pending) → ok:false mit Klartext-Message (A8: kein Throw)", async () => {
    const { approvalId } = await seedPair({ withPendingCharge: false });

    const result = await confirmApproval(approvalId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/widerrufen/i);
  });

  it("unbekanntes Approval → ok:false mit Message (A8: kein Throw)", async () => {
    await seedPair({ withPendingCharge: true });

    const result = await confirmApproval("does-not-exist");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/nicht gefunden/i);
  });
});
