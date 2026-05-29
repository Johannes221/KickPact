import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, clubs, sponsors, invoices } from "@/lib/db/schema";
import {
  listInvoicesForAdmin,
  markInvoicePaid,
  getInvoiceMailInfo
} from "@/lib/db/queries/invoice-admin";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function seedInvoice(opts: { status?: "draft" | "sent" | "paid" | "withheld"; clubName?: string } = {}) {
  const userId = createId();
  await db.insert(users).values({ id: userId, email: `s-${userId}@kickpact.local`, emailVerified: true, name: "S" });
  const sponsorId = createId();
  await db.insert(sponsors).values({ id: sponsorId, userId, displayName: "Sponsor X", type: "familie" });
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: opts.clubName ?? "FC Test", logoUrl: null });
  const invoiceId = createId();
  await db.insert(invoices).values({
    id: invoiceId,
    sponsorId,
    clubId,
    period: "2026-04",
    totalCents: 1500,
    status: opts.status ?? "sent"
  });
  return { invoiceId, sponsorId, clubId, userEmail: `s-${userId}@kickpact.local` };
}

describe.skipIf(isIntegrationDbDisabled)("invoice-admin queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lists invoices with sponsor + club info", async () => {
    const { invoiceId } = await seedInvoice();
    const { invoices: rows, total } = await listInvoicesForAdmin();
    expect(total).toBe(1);
    expect(rows[0].id).toBe(invoiceId);
    expect(rows[0].clubName).toBe("FC Test");
    expect(rows[0].sponsorName).toBe("Sponsor X");
    expect(rows[0].sponsorEmail).toMatch(/@kickpact\.local$/);
  });

  it("filters by status and search", async () => {
    await seedInvoice({ status: "sent", clubName: "Alpha SV" });
    await seedInvoice({ status: "paid", clubName: "Beta FC" });

    const paid = await listInvoicesForAdmin({ status: "paid" });
    expect(paid.total).toBe(1);
    expect(paid.invoices[0].clubName).toBe("Beta FC");

    const search = await listInvoicesForAdmin({ search: "Alpha" });
    expect(search.total).toBe(1);
    expect(search.invoices[0].clubName).toBe("Alpha SV");
  });

  it("marks paid and unpaid", async () => {
    const { invoiceId } = await seedInvoice({ status: "sent" });
    const op = createId();
    await db.insert(users).values({ id: op, email: `op-${op}@kickpact.local`, emailVerified: true, name: "Op", isPlatformAdmin: true });

    await markInvoicePaid({ invoiceId, paid: true, operatorUserId: op });
    let [row] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(row.status).toBe("paid");
    expect(row.paidMarkedAt).not.toBeNull();
    expect(row.paidMarkedBy).toBe(op);

    await markInvoicePaid({ invoiceId, paid: false, operatorUserId: op });
    [row] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
    expect(row.status).toBe("sent");
    expect(row.paidMarkedAt).toBeNull();
  });

  it("getInvoiceMailInfo returns recipient data", async () => {
    const { invoiceId, userEmail } = await seedInvoice();
    const info = await getInvoiceMailInfo(invoiceId);
    expect(info).not.toBeNull();
    expect(info!.sponsorEmail).toBe(userEmail);
    expect(info!.totalCents).toBe(1500);
  });
});
