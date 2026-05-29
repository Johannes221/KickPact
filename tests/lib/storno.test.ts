import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, clubs, sponsors, invoices } from "@/lib/db/schema";
import { createStornoInvoice } from "@/lib/invoicing/storno";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

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
