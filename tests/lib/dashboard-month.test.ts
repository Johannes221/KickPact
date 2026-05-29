import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsors, pledges, pledgeRules, charges } from "@/lib/db/schema";
import { getTopClubsForMonth } from "@/lib/db/queries/platform-stats";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function seedChargeAt(createdAt: Date, clubName: string) {
  const userId = createId();
  await db.insert(users).values({ id: userId, email: `s-${userId}@k.local`, emailVerified: true, name: "S" });
  const sponsorId = createId();
  await db.insert(sponsors).values({ id: sponsorId, userId, displayName: "Sp", type: "familie" });
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: clubName, logoUrl: null });
  const teamId = createId();
  await db.insert(teams).values({ id: teamId, clubId, name: "T", saison: "2526" });
  const pledgeId = createId();
  await db.insert(pledges).values({ id: pledgeId, sponsorId, teamId, endsAt: new Date(Date.now() + 9e9) });
  const ruleId = createId();
  await db.insert(pledgeRules).values({ id: ruleId, pledgeId, triggerType: "goal_total", amountCents: 100 });
  await db.insert(charges).values({
    id: createId(),
    pledgeId,
    pledgeRuleId: ruleId,
    triggerType: "goal_total",
    amountCents: 100,
    status: "confirmed",
    createdAt
  });
}

describe.skipIf(isIntegrationDbDisabled)("getTopClubsForMonth", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("only counts charges within the requested month", async () => {
    // Januar 2026 und März 2026
    await seedChargeAt(new Date(2026, 0, 15, 12), "Januar-Club");
    await seedChargeAt(new Date(2026, 2, 10, 12), "Maerz-Club");

    const jan = await getTopClubsForMonth("2026-01", 5);
    expect(jan).toHaveLength(1);
    expect(jan[0].clubName).toBe("Januar-Club");

    const mar = await getTopClubsForMonth("2026-03", 5);
    expect(mar).toHaveLength(1);
    expect(mar[0].clubName).toBe("Maerz-Club");

    const feb = await getTopClubsForMonth("2026-02", 5);
    expect(feb).toHaveLength(0);
  });
});
