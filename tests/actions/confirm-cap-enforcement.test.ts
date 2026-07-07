/**
 * Confirm-Zeit Cap-Enforcement (Root-Fix "pending_approval reserviert kein
 * Cap-Budget").
 *
 * Seit der Fix pending_approval NICHT mehr gegen den Monats-/Regel-Cap zählt
 * (CAP_COUNTED_STATUSES = confirmed+invoiced), MUSS der Cap beim BESTÄTIGEN
 * durchgesetzt werden — sonst schöbe ein Sponsor durch Bestätigen mehrerer
 * Approvals confirmed+invoiced über den Cap.
 *
 * Missbrauchs-Kontext: ein Trainer kann nicht mehr mit erfundenen, unbestätigten
 * Manual-Events reale Auto-Charges verdrängen (pending zählt nicht) — reale
 * confirmed Auto-Charges bekommen den Cap zuerst; ein Manual-Approval lässt sich
 * nur bestätigen, solange Cap-Rest da ist.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi
    .fn()
    .mockResolvedValue({ id: "u_cc", email: "cc@example.com" })
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

/**
 * Seedet: Cap-Pledge + eine bereits CONFIRMED Auto-Charge (füllt Cap teilweise)
 * + eine PENDING Manual-Charge mit Approval, die der Sponsor bestätigen will.
 */
async function seed(opts: {
  monthlyCapCents: number;
  confirmedCents: number;
  pendingCents: number;
}) {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_cc", email: "cc@example.com" });
  await db.insert(clubs).values({ id: "c_cc", slug: "cc-fc", name: "Confirm-Cap FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_cc",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_CC",
      isActive: true
    })
    .returning();
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: "u_cc", displayName: "Sponsor CC", type: "familie" })
    .returning();
  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: "active",
      startsAt: new Date("2025-08-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T23:59:59Z"),
      monthlyCapCents: opts.monthlyCapCents
    })
    .returning();
  // Auto-Regel (nicht approval-pflichtig) — deren Charge ist bereits confirmed.
  const [autoRule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: opts.confirmedCents,
      requiresApproval: false
    })
    .returning();
  // Manual-Regel (approval-pflichtig) — deren Charge ist pending.
  const [manualRule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "special_goal",
      triggerParamsJson: {},
      amountCents: opts.pendingCents,
      requiresApproval: true
    })
    .returning();
  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      fussballdeSpielId: "fs_cc_1",
      datum: new Date("2026-06-05T13:00:00Z"),
      heimName: "Confirm-Cap FC",
      gastName: "SV Gegner",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  // Confirmed Auto-Charge im AKTUELLEN Monat (Cap-Anker = Abrechnungsmonat = jetzt).
  await db.insert(charges).values({
    pledgeId: pledge.id,
    pledgeRuleId: autoRule.id,
    matchId: match.id,
    matchEventId: null,
    goalIndex: 1,
    triggerType: "goal_total",
    amountCents: opts.confirmedCents,
    status: "confirmed",
    confirmedAt: new Date()
  });
  // Manuelles Event + pending Charge + Approval.
  const [event] = await db
    .insert(matchEvents)
    .values({
      matchId: match.id,
      minute: 42,
      type: "spezial",
      subtype: "freistosstor",
      side: "heim",
      source: "manual"
    })
    .returning();
  await db.insert(charges).values({
    pledgeId: pledge.id,
    pledgeRuleId: manualRule.id,
    matchId: match.id,
    matchEventId: event.id,
    triggerType: "special_goal",
    amountCents: opts.pendingCents,
    status: "pending_approval"
  });
  const [approval] = await db
    .insert(eventApprovals)
    .values({
      matchEventId: event.id,
      pledgeRuleId: manualRule.id,
      status: "pending",
      expiresAt: new Date("2026-06-30T23:59:59Z")
    })
    .returning();
  return { approvalId: approval.id, pledgeId: pledge.id };
}

describe.skipIf(isIntegrationDbDisabled)("Confirm-Zeit Cap-Enforcement", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("Bestätigen über den Monats-Cap wird geblockt — Charge bleibt pending", async () => {
    const db = await getTestDb();
    // Cap 50 €, bereits 30 € confirmed, pending 30 € → 30+30 > 50 → Block.
    const { approvalId } = await seed({
      monthlyCapCents: 5000,
      confirmedCents: 3000,
      pendingCents: 3000
    });

    const result = await confirmApproval(approvalId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/cap/i);

    const rows = await db.select().from(charges);
    // Keine Charge wurde confirmed durch den Approval — die pending bleibt pending.
    expect(rows.filter((c) => c.status === "confirmed")).toHaveLength(1); // nur die Auto-Charge
    expect(rows.filter((c) => c.status === "pending_approval")).toHaveLength(1);
    // Approval bleibt pending (nicht confirmed), damit ein späterer Cap-Freiraum
    // die Bestätigung noch erlaubt.
    const [ap] = await db
      .select()
      .from(eventApprovals)
      .where(eq(eventApprovals.id, approvalId));
    expect(ap.status).toBe("pending");
  });

  it("Bestätigen innerhalb des Cap-Rests funktioniert", async () => {
    const db = await getTestDb();
    // Cap 50 €, bereits 30 € confirmed, pending 20 € → 30+20 = 50 ≤ 50 → OK.
    const { approvalId } = await seed({
      monthlyCapCents: 5000,
      confirmedCents: 3000,
      pendingCents: 2000
    });

    const result = await confirmApproval(approvalId);

    expect(result.ok).toBe(true);
    const rows = await db.select().from(charges);
    expect(rows.filter((c) => c.status === "confirmed")).toHaveLength(2);
    expect(rows.filter((c) => c.status === "pending_approval")).toHaveLength(0);
  });
});
