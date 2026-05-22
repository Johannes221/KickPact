import { test, expect } from "@playwright/test";
import { createId } from "@paralleldrive/cuid2";
import {
  isE2EReady,
  resetE2EDb,
  seedTestUserAndClub,
  authCookie,
  db
} from "./_seed";
import {
  matches,
  matchEvents,
  eventApprovals,
  charges,
  pledges,
  pledgeRules
} from "../../../lib/db/schema";

/**
 * Approval-Inbox E2E (Plan 2026-05-22, Task 7.4).
 *
 * Zwei Sub-Cases: Sponsor confirmt vs. Sponsor disputed eine pending approval.
 * Vorraussetzung: Manuelles Event (subtype "hackentor") inkl. pending-Approval +
 * pending-Charge wurden vom Engine-Job erzeugt — wir simulieren das via direkt-Seed.
 */

async function seedPendingApproval(
  teamId: string,
  sponsorId: string
): Promise<{ matchId: string; eventId: string; pledgeRuleId: string; chargeId: string }> {
  const matchId = createId();
  const eventId = createId();
  const pledgeId = createId();
  const pledgeRuleId = createId();
  const chargeId = createId();
  const approvalId = createId();

  const now = new Date();
  const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);
  const approvalExpires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await db.insert(matches).values({
    id: matchId,
    teamId,
    fussballdeSpielId: `E2E_APPR_${matchId.slice(0, 8)}`,
    datum: now,
    heimName: "FC Sportfreunde 1910 Dossenheim",
    gastName: "TSV Handschuhsheim",
    ergebnisHeim: 2,
    ergebnisGast: 1,
    halbzeitHeim: 1,
    halbzeitGast: 0,
    status: "finished",
    crawledAt: now
  });

  await db.insert(matchEvents).values({
    id: eventId,
    matchId,
    minute: 67,
    type: "spezial",
    subtype: "hackentor",
    side: "heim",
    playerName: "Lukas Wagner",
    source: "manual"
  });

  await db.insert(pledges).values({
    id: pledgeId,
    sponsorId,
    teamId,
    status: "active",
    startsAt: now,
    endsAt,
    createdAt: now
  });

  await db.insert(pledgeRules).values({
    id: pledgeRuleId,
    pledgeId,
    triggerType: "special_goal",
    triggerParamsJson: { subtype: "hackentor" },
    amountCents: 2000,
    requiresApproval: true,
    createdAt: now
  });

  await db.insert(charges).values({
    id: chargeId,
    pledgeId,
    pledgeRuleId,
    matchId,
    matchEventId: eventId,
    triggerType: "special_goal",
    amountCents: 2000,
    status: "pending_approval",
    createdAt: now
  });

  await db.insert(eventApprovals).values({
    id: approvalId,
    matchEventId: eventId,
    pledgeRuleId,
    status: "pending",
    expiresAt: approvalExpires,
    createdAt: now
  });

  return { matchId, eventId, pledgeRuleId, chargeId };
}

test.describe("Approval-Inbox (Confirm + Dispute)", () => {
  test.beforeEach(async () => {
    if (!isE2EReady()) return;
    await resetE2EDb();
  });

  test("sponsor confirms pending approval — charge becomes confirmed", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const seed = await seedTestUserAndClub();
    await seedPendingApproval(seed.teamId, seed.sponsorId);
    await context.addCookies([
      authCookie(seed.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    await page.goto("/sponsor/inbox");
    await expect(page.getByText(/Hackentor/i)).toBeVisible();
    await page.getByRole("button", { name: /bestätigen/i }).click();
    await expect(page.getByText(/bestätigt/i)).toBeVisible();
  });

  test("sponsor disputes pending approval — charge becomes cancelled", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const seed = await seedTestUserAndClub();
    await seedPendingApproval(seed.teamId, seed.sponsorId);
    await context.addCookies([
      authCookie(seed.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    await page.goto("/sponsor/inbox");
    await page.getByRole("button", { name: /bestreiten|ablehnen/i }).click();
    await page
      .getByLabel(/Begründung|grund/i)
      .fill("War ein normaler Schuss, kein Hackentor");
    await page.getByRole("button", { name: /senden|absenden/i }).click();
    await expect(page.getByText(/bestritten|abgelehnt|storniert/i)).toBeVisible();
  });
});
