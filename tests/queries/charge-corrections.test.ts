/**
 * Data-integrity: retroactive correction of an ALREADY-INVOICED match.
 *
 * Regression for the money bug (2026-07-07): `invalidateChargesForMatch` used
 * to silently skip `invoiced` charges when fussball.de re-rated a match after
 * the invoice run, so the sponsor kept paying for events that no longer
 * officially happened — with no signal to anyone. Now such charges are flagged
 * for an admin-review queue, and `createCorrectionInvoice` issues a partial
 * credit note for exactly the affected charges (leaving the rest of the
 * invoice intact).
 *
 * Integration against the docker test DB (DATABASE_URL_TEST), gated like the
 * other integration suites. PDF-Storage is mocked; DB + PDF-render are real.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/invoicing/storage", () => ({
  storePdf: vi.fn().mockResolvedValue("local://test/storno.pdf")
}));

import { charges, matches, invoices, invoiceItems } from "@/lib/db/schema";
import {
  invalidateChargesForMatch,
  listChargesPendingCorrection,
  dismissChargeCorrections
} from "@/lib/db/queries/charges";
import { createCorrectionInvoice } from "@/lib/invoicing/storno";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  seedClubFromFixture,
  seedSponsorWithPledge
} from "../fixtures/scraper/seed-from-fixtures";

async function seedMatch(teamId: string, spielId: string) {
  const db = await getTestDb();
  const [m] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: spielId,
      datum: new Date("2025-09-01T15:00:00Z"),
      heimName: "FC Dossenheim",
      gastName: "TSV Test",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  return m!;
}

describe.skipIf(isIntegrationDbDisabled)("charge-corrections", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("flags invoiced charges (keeps them invoiced) and cancels non-invoiced on match drift", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "corr-flag",
      teamDbId: teamIds.herren1!,
      triggerType: "goal_total",
      amountCents: 500
    });
    const m = await seedMatch(teamIds.herren1!, "FLAG001");

    const [confirmed] = await db
      .insert(charges)
      .values({
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: m.id,
        goalIndex: 1,
        triggerType: "goal_total",
        amountCents: 500,
        status: "confirmed",
        confirmedAt: new Date()
      })
      .returning();
    const [invoiced] = await db
      .insert(charges)
      .values({
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: m.id,
        goalIndex: 2,
        triggerType: "goal_total",
        amountCents: 500,
        status: "invoiced"
      })
      .returning();

    await invalidateChargesForMatch(m.id, "match_updated");

    const [c] = await db.select().from(charges).where(eq(charges.id, confirmed!.id));
    const [i] = await db.select().from(charges).where(eq(charges.id, invoiced!.id));

    // non-invoiced → cancelled, never flagged
    expect(c!.status).toBe("cancelled");
    expect(c!.correctionFlaggedAt).toBeNull();
    // invoiced → stays invoiced (money already billed) BUT now flagged
    expect(i!.status).toBe("invoiced");
    expect(i!.correctionFlaggedAt).toBeInstanceOf(Date);
  });

  it("does not flag anything when the drifted match has no invoiced charges", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "corr-noflag",
      teamDbId: teamIds.herren1!,
      triggerType: "goal_total",
      amountCents: 500
    });
    const m = await seedMatch(teamIds.herren1!, "NOFLAG001");
    await db.insert(charges).values({
      pledgeId,
      pledgeRuleId: ruleId,
      matchId: m.id,
      goalIndex: 1,
      triggerType: "goal_total",
      amountCents: 500,
      status: "confirmed",
      confirmedAt: new Date()
    });

    await invalidateChargesForMatch(m.id, "match_updated");

    const pending = await listChargesPendingCorrection();
    expect(pending).toHaveLength(0);
  });

  it("surfaces flagged invoiced charges via listChargesPendingCorrection with context", async () => {
    const db = await getTestDb();
    const { clubId, teamIds } = await seedClubFromFixture("dossenheim");
    const { sponsorId, pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "corr-list",
      teamDbId: teamIds.herren1!,
      triggerType: "goal_total",
      amountCents: 700
    });
    const m = await seedMatch(teamIds.herren1!, "LIST001");
    const [inv] = await db
      .insert(invoices)
      .values({
        sponsorId,
        clubId,
        period: "2025-09",
        totalCents: 700,
        pdfUrl: "local://c/KP-2026-0001.pdf",
        status: "sent",
        sentAt: new Date()
      })
      .returning();
    const [ch] = await db
      .insert(charges)
      .values({
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: m.id,
        goalIndex: 1,
        triggerType: "goal_total",
        amountCents: 700,
        status: "invoiced",
        invoiceId: inv!.id,
        correctionFlaggedAt: new Date()
      })
      .returning();
    await db.insert(invoiceItems).values({
      invoiceId: inv!.id,
      chargeId: ch!.id,
      description: "Tor",
      amountCents: 700
    });

    const pending = await listChargesPendingCorrection();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      chargeId: ch!.id,
      invoiceId: inv!.id,
      sponsorName: "corr-list",
      clubName: expect.any(String),
      amountCents: 700
    });
    expect(pending[0]!.heimName).toBe("FC Dossenheim");

    // dismiss clears the flag → leaves the queue
    const dismissed = await dismissChargeCorrections([ch!.id]);
    expect(dismissed).toBe(1);
    expect(await listChargesPendingCorrection()).toHaveLength(0);
  });

  it("createCorrectionInvoice credits only the flagged charge, leaving the rest of the invoice intact", async () => {
    const db = await getTestDb();
    const { clubId, teamIds } = await seedClubFromFixture("dossenheim");
    const { sponsorId, pledgeId, ruleId } = await seedSponsorWithPledge({
      sponsorKey: "corr-credit",
      teamDbId: teamIds.herren1!,
      triggerType: "goal_total",
      amountCents: 500
    });
    const mBad = await seedMatch(teamIds.herren1!, "BAD001");
    const mGood = await seedMatch(teamIds.herren1!, "GOOD001");

    const [inv] = await db
      .insert(invoices)
      .values({
        sponsorId,
        clubId,
        period: "2025-09",
        totalCents: 1000,
        pdfUrl: "local://c/KP-2026-0007.pdf",
        status: "sent",
        sentAt: new Date()
      })
      .returning();

    const [chBad] = await db
      .insert(charges)
      .values({
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: mBad.id,
        goalIndex: 1,
        triggerType: "goal_total",
        amountCents: 500,
        status: "invoiced",
        invoiceId: inv!.id,
        correctionFlaggedAt: new Date()
      })
      .returning();
    const [chGood] = await db
      .insert(charges)
      .values({
        pledgeId,
        pledgeRuleId: ruleId,
        matchId: mGood.id,
        goalIndex: 1,
        triggerType: "goal_total",
        amountCents: 500,
        status: "invoiced",
        invoiceId: inv!.id
      })
      .returning();
    await db.insert(invoiceItems).values([
      { invoiceId: inv!.id, chargeId: chBad!.id, description: "Tor (annulliert)", amountCents: 500 },
      { invoiceId: inv!.id, chargeId: chGood!.id, description: "Tor", amountCents: 500 }
    ]);

    const res = await createCorrectionInvoice(inv!.id, [chBad!.id]);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.amountCents).toBe(-500);

    // flagged charge reversed
    const [bad] = await db.select().from(charges).where(eq(charges.id, chBad!.id));
    expect(bad!.status).toBe("cancelled");
    expect(bad!.cancelledReason).toBe("correction_reversed");
    expect(bad!.correctionFlaggedAt).toBeNull();

    // sibling charge untouched
    const [good] = await db.select().from(charges).where(eq(charges.id, chGood!.id));
    expect(good!.status).toBe("invoiced");

    // original invoice stays valid (NOT cancelled)
    const [orig] = await db.select().from(invoices).where(eq(invoices.id, inv!.id));
    expect(orig!.status).toBe("sent");
    expect(orig!.cancelledAt).toBeNull();

    // a reversal invoice exists for -500 pointing at the original
    const reversals = await db
      .select()
      .from(invoices)
      .where(eq(invoices.reversalOfInvoiceId, inv!.id));
    expect(reversals).toHaveLength(1);
    expect(reversals[0]!.totalCents).toBe(-500);

    // exactly one negative reversal item for the bad charge
    const revItems = await db
      .select()
      .from(invoiceItems)
      .where(
        and(
          eq(invoiceItems.invoiceId, reversals[0]!.id),
          eq(invoiceItems.chargeId, chBad!.id)
        )
      );
    expect(revItems).toHaveLength(1);
    expect(revItems[0]!.amountCents).toBe(-500);

    // queue is now empty
    expect(await listChargesPendingCorrection()).toHaveLength(0);
  });
});
