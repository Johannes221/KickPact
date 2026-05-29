import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsors, pledges, pledgeRules, charges } from "@/lib/db/schema";
import {
  listChargesForAdmin,
  cancelChargeAsOperator
} from "@/lib/db/queries/sponsoring-admin";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function seedCharge(status: "confirmed" | "invoiced" | "cancelled" = "confirmed") {
  const userId = createId();
  await db.insert(users).values({ id: userId, email: `s-${userId}@k.local`, emailVerified: true, name: "S" });
  const sponsorId = createId();
  await db.insert(sponsors).values({ id: sponsorId, userId, displayName: "Sponsor X", type: "familie" });
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: "FC Test", logoUrl: null });
  const teamId = createId();
  await db.insert(teams).values({ id: teamId, clubId, name: "1. Herren", saison: "2526" });
  const pledgeId = createId();
  await db.insert(pledges).values({
    id: pledgeId,
    sponsorId,
    teamId,
    endsAt: new Date(Date.now() + 30 * 86400_000)
  });
  const ruleId = createId();
  await db.insert(pledgeRules).values({
    id: ruleId,
    pledgeId,
    triggerType: "goal_total",
    amountCents: 500
  });
  const chargeId = createId();
  await db.insert(charges).values({
    id: chargeId,
    pledgeId,
    pledgeRuleId: ruleId,
    triggerType: "goal_total",
    amountCents: 500,
    status
  });
  return { chargeId, clubId };
}

describe.skipIf(isIntegrationDbDisabled)("sponsoring-admin queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lists charges with sponsor/club/team context", async () => {
    const { chargeId } = await seedCharge("confirmed");
    const { charges: rows, total } = await listChargesForAdmin();
    expect(total).toBe(1);
    expect(rows[0].id).toBe(chargeId);
    expect(rows[0].clubName).toBe("FC Test");
    expect(rows[0].teamName).toBe("1. Herren");
    expect(rows[0].sponsorName).toBe("Sponsor X");
    expect(rows[0].triggerType).toBe("goal_total");
  });

  it("filters by status", async () => {
    await seedCharge("confirmed");
    await seedCharge("invoiced");
    const confirmed = await listChargesForAdmin({ status: "confirmed" });
    expect(confirmed.total).toBe(1);
    const invoiced = await listChargesForAdmin({ status: "invoiced" });
    expect(invoiced.total).toBe(1);
  });

  it("cancels a confirmed charge", async () => {
    const { chargeId } = await seedCharge("confirmed");
    const ok = await cancelChargeAsOperator(chargeId, "Testgrund");
    expect(ok).toBe(true);
    const [row] = await db.select().from(charges).where(eq(charges.id, chargeId));
    expect(row.status).toBe("cancelled");
    expect(row.cancelledReason).toBe("Testgrund");
  });

  it("refuses to cancel an invoiced charge", async () => {
    const { chargeId } = await seedCharge("invoiced");
    const ok = await cancelChargeAsOperator(chargeId, "egal");
    expect(ok).toBe(false);
    const [row] = await db.select().from(charges).where(eq(charges.id, chargeId));
    expect(row.status).toBe("invoiced");
  });
});
