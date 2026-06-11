/**
 * season_custom braucht Sponsor-Approval (Audit 2026-06-11 / Phase 2 / C2).
 *
 * Vorher: evaluate-season bestätigte season_custom automatisch — der Verein
 * behauptete das Custom-Ziel (customNotes) und der Sponsor zahlte ungefragt.
 * Jetzt: Charge entsteht als pending_approval; da Saison-Charges kein
 * matchEvent haben, läuft die Bestätigung DIREKT auf der Charge
 * (confirmSeasonCharge/disputeSeasonCharge mit Sponsor-Tenancy-Check).
 * Liegt sie >21 Tage, storniert der expire-approvals-Cron.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const { mockUserId } = vi.hoisted(() => ({ mockUserId: { current: "u_sc_sponsor" } }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: `${mockUserId.current}@example.com`
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
  charges,
  seasonResults
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { runEvaluateSeason } from "@/lib/inngest/functions/evaluate-season";
import { confirmSeasonCharge, disputeSeasonCharge } from "@/lib/actions/season-charges";
import { expireApprovals } from "@/lib/inngest/functions/lifecycle-cleanup";

async function seedSeasonCustom(): Promise<{ teamId: string; ruleId: string }> {
  const db = await getTestDb();
  await db.insert(users).values([
    { id: "u_sc_sponsor", email: "sc-sponsor@example.com" },
    { id: "u_sc_other", email: "sc-other@example.com" }
  ]);
  await db.insert(clubs).values({ id: "c_sc", slug: "sc-fc", name: "Season FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_sc",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_SC",
      isActive: true
    })
    .returning();
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: "u_sc_sponsor", displayName: "Saison-Sponsor", type: "familie" })
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
  const [rule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "season_custom",
      triggerParamsJson: {},
      amountCents: 7500,
      requiresApproval: false
    })
    .returning();
  await db.insert(seasonResults).values({
    teamId: team.id,
    saison: "2526",
    promoted: false,
    relegated: false,
    customNotes: "Bester Torjäger der Liga"
  });
  return { teamId: team.id, ruleId: rule.id };
}

describe.skipIf(isIntegrationDbDisabled)("season_custom Approval-Flow (C2)", () => {
  beforeEach(async () => {
    await resetTestDb();
    mockUserId.current = "u_sc_sponsor";
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("evaluate-season erzeugt season_custom als pending_approval", async () => {
    const db = await getTestDb();
    const { teamId } = await seedSeasonCustom();

    const res = await runEvaluateSeason({ teamId, saison: "2526" });

    expect(res.chargesCreated).toBe(1);
    const [charge] = await db.select().from(charges);
    expect(charge.status).toBe("pending_approval");
    expect(charge.confirmedAt).toBeNull();
  });

  it("confirmSeasonCharge: nur der eigene Sponsor kann bestätigen", async () => {
    const db = await getTestDb();
    const { teamId } = await seedSeasonCustom();
    await runEvaluateSeason({ teamId, saison: "2526" });
    const [charge] = await db.select().from(charges);

    // Fremder User → abgelehnt, Charge unverändert.
    mockUserId.current = "u_sc_other";
    await expect(confirmSeasonCharge(charge.id)).rejects.toThrow(/nicht gefunden|autorisiert/i);
    const [afterForeign] = await db.select().from(charges);
    expect(afterForeign.status).toBe("pending_approval");

    // Eigener Sponsor → bestätigt.
    mockUserId.current = "u_sc_sponsor";
    const result = await confirmSeasonCharge(charge.id);
    expect(result.ok).toBe(true);
    const [confirmed] = await db.select().from(charges);
    expect(confirmed.status).toBe("confirmed");
    expect(confirmed.confirmedAt).not.toBeNull();
  });

  it("disputeSeasonCharge storniert die Charge mit Audit-Feldern", async () => {
    const db = await getTestDb();
    const { teamId } = await seedSeasonCustom();
    await runEvaluateSeason({ teamId, saison: "2526" });
    const [charge] = await db.select().from(charges);

    const result = await disputeSeasonCharge({ chargeId: charge.id, reason: "Nicht erreicht" });
    expect(result.ok).toBe(true);
    const [cancelled] = await db.select().from(charges);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelledReason).toBe("sponsor_dispute");
    expect(cancelled.cancelledByUserId).toBe("u_sc_sponsor");
    expect(cancelled.cancelledAt).not.toBeNull();
  });

  it("expire-approvals storniert direkte Charges nach 21 Tagen pending", async () => {
    const db = await getTestDb();
    const { teamId } = await seedSeasonCustom();
    await runEvaluateSeason({ teamId, saison: "2526" });
    // Charge auf 22 Tage alt zurückdatieren.
    await db
      .update(charges)
      .set({ createdAt: new Date(Date.now() - 22 * 24 * 60 * 60 * 1000) });

    const fn = (expireApprovals as unknown as {
      fn: (ctx: {
        step: { run: <T>(l: string, f: () => Promise<T> | T) => Promise<T> };
        logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
      }) => Promise<unknown>;
    }).fn;
    await fn({
      step: { run: async (_l, f) => f() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });

    const [expired] = await db.select().from(charges);
    expect(expired.status).toBe("cancelled");
    expect(expired.cancelledReason).toBe("approval_expired");
  });

  it("expire-approvals lässt junge direkte Charges in Ruhe", async () => {
    const db = await getTestDb();
    const { teamId } = await seedSeasonCustom();
    await runEvaluateSeason({ teamId, saison: "2526" });

    const fn = (expireApprovals as unknown as {
      fn: (ctx: {
        step: { run: <T>(l: string, f: () => Promise<T> | T) => Promise<T> };
        logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
      }) => Promise<unknown>;
    }).fn;
    await fn({
      step: { run: async (_l, f) => f() },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    });

    const [row] = await db.select().from(charges);
    expect(row.status).toBe("pending_approval");
  });
});
