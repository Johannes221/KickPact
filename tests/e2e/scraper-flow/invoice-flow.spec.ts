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
  charges,
  invoices,
  invoiceItems,
  pledges,
  pledgeRules,
  matches
} from "../../../lib/db/schema";

/**
 * Invoice-Flow E2E (Plan 2026-05-22, Task 7.6).
 *
 * Sponsor sieht monatliche Rechnung als PDF-Download, Verein markiert sie
 * als bezahlt. Setzt voraus dass für 2026-04 mindestens 3 confirmed-charges
 * existieren — Inngest-Job (oder direkter Seed) erzeugt daraus eine invoice
 * mit pdfUrl.
 *
 * Hinweis: `lib/inngest/functions/generate-invoices.ts` exportiert nur
 * `generateInvoices` (Inngest-Function-Objekt), kein direkt-runnable Handler.
 * Wir seeden hier daher die Invoice direkt — das ist legitim für E2E auf
 * UI-Ebene (UI ist Subject Under Test, nicht der Job).
 */

async function seedInvoiceForPeriod(seed: {
  sponsorId: string;
  clubId: string;
  teamId: string;
}): Promise<{ invoiceId: string }> {
  const pledgeId = createId();
  const ruleId = createId();
  const invoiceId = createId();
  const now = new Date();
  const endsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365);

  await db.insert(pledges).values({
    id: pledgeId,
    sponsorId: seed.sponsorId,
    teamId: seed.teamId,
    status: "active",
    startsAt: now,
    endsAt,
    createdAt: now
  });
  await db.insert(pledgeRules).values({
    id: ruleId,
    pledgeId,
    triggerType: "goal_total",
    amountCents: 500,
    requiresApproval: false,
    createdAt: now
  });

  // 3 confirmed charges für April 2026
  const matchId = createId();
  await db.insert(matches).values({
    id: matchId,
    teamId: seed.teamId,
    fussballdeSpielId: `E2E_INV_${matchId.slice(0, 8)}`,
    datum: new Date("2026-04-15T15:00:00Z"),
    heimName: "FC Sportfreunde 1910 Dossenheim",
    gastName: "TSV Handschuhsheim",
    ergebnisHeim: 3,
    ergebnisGast: 1,
    halbzeitHeim: 2,
    halbzeitGast: 0,
    status: "finished",
    crawledAt: now
  });

  const chargeIds: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = createId();
    chargeIds.push(id);
    await db.insert(charges).values({
      id,
      pledgeId,
      pledgeRuleId: ruleId,
      matchId,
      triggerType: "goal_total",
      amountCents: 500,
      status: "invoiced",
      confirmedAt: new Date("2026-04-15T16:00:00Z"),
      createdAt: new Date("2026-04-15T16:00:00Z"),
      invoiceId
    });
  }

  await db.insert(invoices).values({
    id: invoiceId,
    sponsorId: seed.sponsorId,
    clubId: seed.clubId,
    period: "2026-04",
    totalCents: 1500,
    pdfUrl: "https://example.test/invoices/sample.pdf",
    status: "sent",
    sentAt: new Date("2026-05-01T00:00:00Z"),
    createdAt: new Date("2026-05-01T00:00:00Z")
  });

  for (const cid of chargeIds) {
    await db.insert(invoiceItems).values({
      id: createId(),
      invoiceId,
      chargeId: cid,
      description: "Pro Tor im Spiel gegen TSV Handschuhsheim",
      amountCents: 500
    });
  }

  return { invoiceId };
}

test.describe("Invoice-Flow (Sponsor PDF + Verein paid)", () => {
  test.beforeEach(async () => {
    if (!isE2EReady()) return;
    await resetE2EDb();
  });

  test("monthly invoice — sponsor sieht PDF, verein markiert als bezahlt", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const seed = await seedTestUserAndClub();
    await seedInvoiceForPeriod(seed);
    await context.addCookies([
      authCookie(seed.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    // Sponsor sieht Invoice
    await page.goto("/sponsor/rechnungen");
    await expect(page.getByText(/April 2026|2026-04/i)).toBeVisible();

    // PDF-Link funktioniert (oder Download startet)
    const pdfLink = page.getByRole("link", { name: /pdf|rechnung herunterladen|download/i });
    await expect(pdfLink).toBeVisible();
    const href = await pdfLink.getAttribute("href");
    expect(href).toBeTruthy();

    // Verein markiert als bezahlt
    await page.goto("/verein/dossenheim/abrechnungen");
    const payBtn = page.getByRole("button", { name: /als bezahlt markieren|bezahlt markieren/i }).first();
    await expect(payBtn).toBeVisible();
    await payBtn.click();
    await expect(page.getByText(/bezahlt/i)).toBeVisible();
  });
});
