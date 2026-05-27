/**
 * Tests for releaseWithheldInvoicesForTeam and releaseWithheldInvoicesForClub
 * (lib/db/queries/verifications.ts).
 *
 * Fixture graph per test:
 *   Club (optionally verified) → Team (optionally verified)
 *   → Sponsor → Pledge (for team) → PledgeRule → Charge
 *   → Invoice (withheld) → InvoiceItem (→ Charge)
 */
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
  charges,
  invoices,
  invoiceItems
} from "@/lib/db/schema";
import {
  releaseWithheldInvoicesForClub,
  releaseWithheldInvoicesForTeam
} from "@/lib/db/queries/verifications";
import { resetTestDb } from "../setup/db";

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

async function seedUser(hint: string): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `${hint}-${id.slice(0, 6)}@kickpact.local`,
    emailVerified: true,
    name: hint,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return id;
}

async function seedSponsor(userId: string): Promise<string> {
  const id = createId();
  await db.insert(sponsors).values({ id, userId, displayName: "Sponsor", type: "familie" });
  return id;
}

interface SeedResult {
  clubId: string;
  teamId: string;
  sponsorId: string;
  invoiceId: string;
}

/**
 * Builds the full fixture graph for one invoice:
 *   Club → Team → Pledge → PledgeRule → Charge → Invoice (withheld) → InvoiceItem
 */
async function seedWithheldInvoice(opts: {
  clubVerified?: boolean;
  teamVerified?: boolean;
} = {}): Promise<SeedResult> {
  const userId = await seedUser("wh");
  const sponsorId = await seedSponsor(userId);

  const clubId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `club-${clubId.slice(0, 6)}`,
    name: "FC Withhold",
    verifiedAt: opts.clubVerified ? new Date() : null
  });

  const teamId = createId();
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "Herren 1",
    saison: "2526",
    verifiedAt: opts.teamVerified ? new Date() : null
  });

  const pledgeId = createId();
  await db.insert(pledges).values({
    id: pledgeId,
    sponsorId,
    teamId,
    status: "active",
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
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
    matchId: null,
    matchEventId: null,
    saison: "2526",
    triggerType: "goal_total",
    amountCents: 500,
    status: "confirmed"
  });

  const invoiceId = createId();
  await db.insert(invoices).values({
    id: invoiceId,
    sponsorId,
    clubId,
    period: "2026-04",
    totalCents: 500,
    status: "withheld"
  });

  await db.insert(invoiceItems).values({
    id: createId(),
    invoiceId,
    chargeId,
    description: "Tor · FC Withhold vs Gegner · pro Tor",
    amountCents: 500
  });

  return { clubId, teamId, sponsorId, invoiceId };
}

async function getInvoiceStatus(id: string): Promise<string | undefined> {
  const [row] = await db
    .select({ status: invoices.status })
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  return row?.status;
}

// ─────────────────────────────────────────────────────────────────────────────
// releaseWithheldInvoicesForClub
// ─────────────────────────────────────────────────────────────────────────────

describe("releaseWithheldInvoicesForClub", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("flips withheld → sent and returns count", async () => {
    const { clubId, invoiceId } = await seedWithheldInvoice({ clubVerified: true });

    const result = await releaseWithheldInvoicesForClub(clubId);

    expect(result.count).toBe(1);
    expect(result.invoiceIds).toContain(invoiceId);
    expect(await getInvoiceStatus(invoiceId)).toBe("sent");
  });

  it("returns 0 when no withheld invoices exist", async () => {
    const { clubId, invoiceId } = await seedWithheldInvoice({ clubVerified: true });
    // Manually set to sent first
    await db
      .update(invoices)
      .set({ status: "sent" })
      .where(eq(invoices.id, invoiceId));

    const result = await releaseWithheldInvoicesForClub(clubId);
    expect(result.count).toBe(0);
    expect(result.invoiceIds).toHaveLength(0);
  });

  it("releases multiple withheld invoices in one call", async () => {
    // Seed two separate invoice fixtures for the same club by reusing parts
    const userId = await seedUser("multi");
    const sponsorId = await seedSponsor(userId);

    const clubId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `multi-${clubId.slice(0, 6)}`,
      name: "FC Multi",
      verifiedAt: new Date()
    });

    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      const invId = createId();
      await db.insert(invoices).values({
        id: invId,
        sponsorId,
        clubId,
        period: `2026-0${i + 1}`,
        totalCents: 100,
        status: "withheld"
      });
      ids.push(invId);
    }

    const result = await releaseWithheldInvoicesForClub(clubId);
    expect(result.count).toBe(2);
    expect(result.invoiceIds).toHaveLength(2);
    for (const id of ids) {
      expect(await getInvoiceStatus(id)).toBe("sent");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// releaseWithheldInvoicesForTeam
// ─────────────────────────────────────────────────────────────────────────────

describe("releaseWithheldInvoicesForTeam", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("releases invoice when club+team both verified", async () => {
    const { teamId, invoiceId } = await seedWithheldInvoice({
      clubVerified: true,
      teamVerified: true
    });

    const result = await releaseWithheldInvoicesForTeam(teamId);

    expect(result.count).toBe(1);
    expect(result.invoiceIds).toContain(invoiceId);
    expect(await getInvoiceStatus(invoiceId)).toBe("sent");
  });

  it("returns 0 when club is not yet verified", async () => {
    const { teamId, invoiceId } = await seedWithheldInvoice({
      clubVerified: false,
      teamVerified: true
    });

    const result = await releaseWithheldInvoicesForTeam(teamId);

    expect(result.count).toBe(0);
    expect(result.invoiceIds).toHaveLength(0);
    expect(await getInvoiceStatus(invoiceId)).toBe("withheld");
  });

  it("returns 0 when team is not verified", async () => {
    const { teamId, invoiceId } = await seedWithheldInvoice({
      clubVerified: true,
      teamVerified: false
    });

    const result = await releaseWithheldInvoicesForTeam(teamId);

    expect(result.count).toBe(0);
    expect(result.invoiceIds).toHaveLength(0);
    expect(await getInvoiceStatus(invoiceId)).toBe("withheld");
  });

  it("does not release invoice that involves another unverified team", async () => {
    // Club is verified; teamA is the one being approved; teamB stays unverified
    // The invoice involves charges from both teamA and teamB
    const userId = await seedUser("multi-team");
    const sponsorId = await seedSponsor(userId);

    const clubId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `mt-${clubId.slice(0, 6)}`,
      name: "FC Multi-Team",
      verifiedAt: new Date()
    });

    // teamA: just approved (verified)
    const teamAId = createId();
    await db.insert(teams).values({
      id: teamAId,
      clubId,
      name: "Herren 1",
      saison: "2526",
      verifiedAt: new Date()
    });

    // teamB: still unverified
    const teamBId = createId();
    await db.insert(teams).values({
      id: teamBId,
      clubId,
      name: "Herren 2",
      saison: "2526",
      verifiedAt: null
    });

    // Pledge + rule for teamA
    const pledgeAId = createId();
    await db.insert(pledges).values({
      id: pledgeAId,
      sponsorId,
      teamId: teamAId,
      status: "active",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });
    const ruleAId = createId();
    await db.insert(pledgeRules).values({
      id: ruleAId,
      pledgeId: pledgeAId,
      triggerType: "goal_total",
      amountCents: 500
    });
    const chargeAId = createId();
    await db.insert(charges).values({
      id: chargeAId,
      pledgeId: pledgeAId,
      pledgeRuleId: ruleAId,
      saison: "2526",
      triggerType: "goal_total",
      amountCents: 500,
      status: "confirmed"
    });

    // Pledge + rule for teamB
    const pledgeBId = createId();
    await db.insert(pledges).values({
      id: pledgeBId,
      sponsorId,
      teamId: teamBId,
      status: "active",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    });
    const ruleBId = createId();
    await db.insert(pledgeRules).values({
      id: ruleBId,
      pledgeId: pledgeBId,
      triggerType: "goal_total",
      amountCents: 300
    });
    const chargeBId = createId();
    await db.insert(charges).values({
      id: chargeBId,
      pledgeId: pledgeBId,
      pledgeRuleId: ruleBId,
      saison: "2526",
      triggerType: "goal_total",
      amountCents: 300,
      status: "confirmed"
    });

    // One invoice covering BOTH teams' charges
    const invoiceId = createId();
    await db.insert(invoices).values({
      id: invoiceId,
      sponsorId,
      clubId,
      period: "2026-04",
      totalCents: 800,
      status: "withheld"
    });
    await db.insert(invoiceItems).values([
      {
        id: createId(),
        invoiceId,
        chargeId: chargeAId,
        description: "Herren 1 · pro Tor",
        amountCents: 500
      },
      {
        id: createId(),
        invoiceId,
        chargeId: chargeBId,
        description: "Herren 2 · pro Tor",
        amountCents: 300
      }
    ]);

    // Approve teamA → should NOT release invoice (teamB still unverified)
    const result = await releaseWithheldInvoicesForTeam(teamAId);

    expect(result.count).toBe(0);
    expect(result.invoiceIds).toHaveLength(0);
    expect(await getInvoiceStatus(invoiceId)).toBe("withheld");
  });

  it("releases invoice after all teams become verified", async () => {
    // Same setup as above, but now also verify teamB before calling release
    const userId = await seedUser("all-verified");
    const sponsorId = await seedSponsor(userId);

    const clubId = createId();
    await db.insert(clubs).values({
      id: clubId,
      slug: `av-${clubId.slice(0, 6)}`,
      name: "FC All-Verified",
      verifiedAt: new Date()
    });

    const now = new Date();
    const teamAId = createId();
    const teamBId = createId();
    await db.insert(teams).values([
      { id: teamAId, clubId, name: "A", saison: "2526", verifiedAt: now },
      { id: teamBId, clubId, name: "B", saison: "2526", verifiedAt: now }
    ]);

    const sponsorId2 = sponsorId; // reuse for simplicity
    const pledgeAId = createId();
    const pledgeBId = createId();
    await db.insert(pledges).values([
      {
        id: pledgeAId,
        sponsorId: sponsorId2,
        teamId: teamAId,
        status: "active",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      },
      {
        id: pledgeBId,
        sponsorId: sponsorId2,
        teamId: teamBId,
        status: "active",
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      }
    ]);

    const ruleAId = createId();
    const ruleBId = createId();
    await db.insert(pledgeRules).values([
      { id: ruleAId, pledgeId: pledgeAId, triggerType: "goal_total", amountCents: 500 },
      { id: ruleBId, pledgeId: pledgeBId, triggerType: "goal_total", amountCents: 300 }
    ]);

    const chargeAId = createId();
    const chargeBId = createId();
    await db.insert(charges).values([
      {
        id: chargeAId,
        pledgeId: pledgeAId,
        pledgeRuleId: ruleAId,
        saison: "2526",
        triggerType: "goal_total",
        amountCents: 500,
        status: "confirmed"
      },
      {
        id: chargeBId,
        pledgeId: pledgeBId,
        pledgeRuleId: ruleBId,
        saison: "2526",
        triggerType: "goal_total",
        amountCents: 300,
        status: "confirmed"
      }
    ]);

    const invoiceId = createId();
    await db.insert(invoices).values({
      id: invoiceId,
      sponsorId: sponsorId2,
      clubId,
      period: "2026-04",
      totalCents: 800,
      status: "withheld"
    });
    await db.insert(invoiceItems).values([
      {
        id: createId(),
        invoiceId,
        chargeId: chargeAId,
        description: "A · Tor",
        amountCents: 500
      },
      {
        id: createId(),
        invoiceId,
        chargeId: chargeBId,
        description: "B · Tor",
        amountCents: 300
      }
    ]);

    // Both teams verified → calling for teamA should release
    const result = await releaseWithheldInvoicesForTeam(teamAId);
    expect(result.count).toBe(1);
    expect(result.invoiceIds).toContain(invoiceId);
    expect(await getInvoiceStatus(invoiceId)).toBe("sent");
  });

  it("returns 0 for unknown teamId", async () => {
    const result = await releaseWithheldInvoicesForTeam("nonexistent-id");
    expect(result.count).toBe(0);
    expect(result.invoiceIds).toHaveLength(0);
  });
});
