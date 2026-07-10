import { beforeEach, describe, expect, it, vi } from "vitest";
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
  matches,
  charges,
  invoices,
  invoiceItems
} from "@/lib/db/schema";
import { createStornoInvoice, createCorrectionInvoice } from "@/lib/invoicing/storno";
import { getSponsorBalance } from "@/lib/db/queries/sponsor-reporting";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

// PDF-Rendering läuft real; nur den Storage-Write stubben (kein FS/R2 im Test).
vi.mock("@/lib/invoicing/storage", () => ({
  storePdf: vi.fn().mockResolvedValue("local://test/storno.pdf")
}));

async function seedInvoice(overrides: Partial<typeof invoices.$inferInsert> = {}) {
  const userId = createId();
  await db.insert(users).values({ id: userId, email: `s-${userId}@k.local`, emailVerified: true, name: "S" });
  const sponsorId = createId();
  await db.insert(sponsors).values({ id: sponsorId, userId, displayName: "Sp", type: "familie" });
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: "FC Test", logoUrl: null });
  const invoiceId = createId();
  await db.insert(invoices).values({
    id: invoiceId,
    sponsorId,
    clubId,
    period: "2026-04",
    totalCents: 1500,
    status: "sent",
    pdfUrl: `local://${clubId}/KP-2026-0001.pdf`,
    ...overrides
  });
  return invoiceId;
}

describe.skipIf(isIntegrationDbDisabled)("createStornoInvoice — Guards", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("rejects unknown invoice", async () => {
    const r = await createStornoInvoice("does-not-exist");
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects a draft invoice (wrong status)", async () => {
    const id = await seedInvoice({ status: "draft" });
    const r = await createStornoInvoice(id);
    expect(r).toEqual({ ok: false, reason: "wrong_status" });
  });

  it("rejects an already-cancelled invoice", async () => {
    const id = await seedInvoice({ cancelledAt: new Date() });
    const r = await createStornoInvoice(id);
    expect(r).toEqual({ ok: false, reason: "already_cancelled" });
  });

  it("rejects stornoing a storno", async () => {
    const original = await seedInvoice();
    const stornoId = await seedInvoice({ reversalOfInvoiceId: original, totalCents: -1500 });
    const r = await createStornoInvoice(stornoId);
    expect(r).toEqual({ ok: false, reason: "is_storno" });
  });

  it("rejects when the original has no pdf/number", async () => {
    const id = await seedInvoice({ pdfUrl: null });
    const r = await createStornoInvoice(id);
    expect(r).toEqual({ ok: false, reason: "no_pdf" });
  });
});

/**
 * Business-Logik-Bug (Tier 1): Der Storno hob nur die Rechnungs-Zeile auf,
 * ließ die zugrunde liegenden Charges aber auf status='invoiced' — Sponsor-
 * Reporting zählt 'invoiced' als aktiv weiter, die Bilanz zeigte den
 * erstatteten Betrag dauerhaft. Der Storno muss die Charges reversen.
 */
describe.skipIf(isIntegrationDbDisabled)("createStornoInvoice — Charge-Reversal", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  async function seedInvoicedCharge() {
    const userId = createId();
    await db.insert(users).values({ id: userId, email: `s-${userId}@k.local`, emailVerified: true, name: "S" });
    const sponsorId = createId();
    await db.insert(sponsors).values({ id: sponsorId, userId, displayName: "Sp", type: "familie" });
    const clubId = createId();
    await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: "FC Test", logoUrl: null });
    const teamId = createId();
    await db.insert(teams).values({ id: teamId, clubId, name: "Erste", saison: "2526" });
    const pledgeId = createId();
    await db.insert(pledges).values({
      id: pledgeId,
      sponsorId,
      teamId,
      status: "active",
      startsAt: new Date(Date.UTC(2025, 6, 1)),
      endsAt: new Date(Date.UTC(2026, 5, 30))
    });
    const ruleId = createId();
    await db.insert(pledgeRules).values({
      id: ruleId,
      pledgeId,
      triggerType: "goal_total",
      amountCents: 20000,
      requiresApproval: false
    });
    const matchId = createId();
    await db.insert(matches).values({
      id: matchId,
      teamId,
      fussballdeSpielId: `fs-${matchId.slice(0, 6)}`,
      datum: new Date(Date.UTC(2026, 4, 10, 13, 0)),
      heimName: "FC Test",
      gastName: "SV Gegner",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished"
    });
    const invoiceId = createId();
    await db.insert(invoices).values({
      id: invoiceId,
      sponsorId,
      clubId,
      period: "2026-05",
      totalCents: 20000,
      status: "sent",
      sentAt: new Date(),
      pdfUrl: `local://${clubId}/KP-2026-0002.pdf`
    });
    const chargeId = createId();
    await db.insert(charges).values({
      id: chargeId,
      pledgeId,
      pledgeRuleId: ruleId,
      matchId,
      triggerType: "goal_total",
      amountCents: 20000,
      status: "invoiced",
      invoiceId,
      confirmedAt: new Date(Date.UTC(2026, 4, 10, 15, 0)),
      createdAt: new Date(Date.UTC(2026, 4, 10, 15, 0))
    });
    await db.insert(invoiceItems).values({
      invoiceId,
      chargeId,
      description: "1 Tor",
      amountCents: 20000
    });
    return { sponsorId, invoiceId, chargeId };
  }

  it("sets the underlying charges to cancelled", async () => {
    const { invoiceId, chargeId } = await seedInvoicedCharge();

    const r = await createStornoInvoice(invoiceId);
    expect(r.ok).toBe(true);

    const [ch] = await db.select().from(charges).where(eq(charges.id, chargeId));
    expect(ch.status).toBe("cancelled");
    expect(ch.cancelledAt).not.toBeNull();
  });

  it("removes the reversed amount from the sponsor balance", async () => {
    const { sponsorId, invoiceId } = await seedInvoicedCharge();

    const range = { from: new Date(Date.UTC(2000, 0, 1)), to: new Date(Date.UTC(2030, 0, 1)) };
    const before = await getSponsorBalance(sponsorId, range);
    expect(before.totalCents).toBe(20000);

    await createStornoInvoice(invoiceId);

    const after = await getSponsorBalance(sponsorId, range);
    expect(after.totalCents).toBe(0);
    expect(after.eventsCount).toBe(0);
  });
});

/**
 * Review M1 / Wave 4: Teil-Gutschrift (createCorrectionInvoice) darf einen
 * Alt-Beleg NICHT teilweise erstatten. Belege VOR dem Privatpersonen-Pivot
 * tragen totalCents = Σ Netto-Zeilen + 19 % USt. Eine Teil-Gutschrift würde nur
 * die Netto-Zeilen erstatten und den anteiligen USt-Betrag unterschlagen
 * (Unter-Erstattung) → solche Belege nur vollständig stornieren.
 */
describe.skipIf(isIntegrationDbDisabled)("createCorrectionInvoice — Alt-USt-Guard", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  // Zwei fakturierte Charges à 500 ct (Σ Items = 1000). `invoiceTotalCents`
  // steuert die Alt-USt-Kante: 1190 = 1000 netto + 19 % (Legacy), 1000 =
  // post-pivot (USt-frei).
  async function seedTwoChargeInvoice(invoiceTotalCents: number) {
    const userId = createId();
    await db.insert(users).values({ id: userId, email: `s-${userId}@k.local`, emailVerified: true, name: "S" });
    const sponsorId = createId();
    await db.insert(sponsors).values({ id: sponsorId, userId, displayName: "Sp", type: "familie" });
    const clubId = createId();
    await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: "FC Test", logoUrl: null });
    const teamId = createId();
    await db.insert(teams).values({ id: teamId, clubId, name: "Erste", saison: "2526" });
    const pledgeId = createId();
    await db.insert(pledges).values({
      id: pledgeId,
      sponsorId,
      teamId,
      status: "active",
      startsAt: new Date(Date.UTC(2025, 6, 1)),
      endsAt: new Date(Date.UTC(2026, 5, 30))
    });
    const ruleId = createId();
    await db.insert(pledgeRules).values({
      id: ruleId,
      pledgeId,
      triggerType: "goal_total",
      amountCents: 500,
      requiresApproval: false
    });
    const matchId = createId();
    await db.insert(matches).values({
      id: matchId,
      teamId,
      fussballdeSpielId: `fs-${matchId.slice(0, 6)}`,
      datum: new Date(Date.UTC(2026, 4, 10, 13, 0)),
      heimName: "FC Test",
      gastName: "SV Gegner",
      ergebnisHeim: 2,
      ergebnisGast: 0,
      status: "finished"
    });
    const invoiceId = createId();
    await db.insert(invoices).values({
      id: invoiceId,
      sponsorId,
      clubId,
      period: "2026-05",
      totalCents: invoiceTotalCents,
      status: "sent",
      sentAt: new Date(),
      pdfUrl: `local://${clubId}/KP-2026-0003.pdf`
    });
    const chargeIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const chargeId = createId();
      await db.insert(charges).values({
        id: chargeId,
        pledgeId,
        pledgeRuleId: ruleId,
        matchId,
        triggerType: "goal_total",
        amountCents: 500,
        status: "invoiced",
        invoiceId,
        goalIndex: i + 1,
        confirmedAt: new Date(Date.UTC(2026, 4, 10, 15, 0)),
        createdAt: new Date(Date.UTC(2026, 4, 10, 15, 0))
      });
      await db.insert(invoiceItems).values({
        invoiceId,
        chargeId,
        description: `Tor ${i + 1}`,
        amountCents: 500
      });
      chargeIds.push(chargeId);
    }
    return { invoiceId, chargeIds };
  }

  it("blocks partial credit on a legacy invoice with baked-in USt", async () => {
    // totalCents 1190 != Σ Items 1000 → Alt-Beleg, Teil-Gutschrift verboten.
    const { invoiceId, chargeIds } = await seedTwoChargeInvoice(1190);
    const r = await createCorrectionInvoice(invoiceId, [chargeIds[0]]);
    expect(r).toEqual({ ok: false, reason: "legacy_ust_partial" });

    // Ursprüngliche Charge bleibt unangetastet (keine Fehl-Stornierung).
    const [ch] = await db.select().from(charges).where(eq(charges.id, chargeIds[0]));
    expect(ch.status).toBe("invoiced");
  });

  it("allows partial credit on a post-pivot invoice (total == item sum)", async () => {
    const { invoiceId, chargeIds } = await seedTwoChargeInvoice(1000);
    const r = await createCorrectionInvoice(invoiceId, [chargeIds[0]]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amountCents).toBe(-500);

    const [reversed] = await db.select().from(charges).where(eq(charges.id, chargeIds[0]));
    expect(reversed.status).toBe("cancelled");
    // Die zweite Charge bleibt gültig (Teil-Gutschrift, kein Vollstorno).
    const [kept] = await db.select().from(charges).where(eq(charges.id, chargeIds[1]));
    expect(kept.status).toBe("invoiced");
  });
});
