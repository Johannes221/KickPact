/**
 * Action-level tests for `markInvoicePaidBySponsor` — the sponsor-side
 * "Habe bezahlt"-Toggle. Mocks the db client + session like the
 * subscriptions-checkout test pattern; runtime DB integration is covered
 * separately by the migration tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbSelectFn, dbUpdateSetFn, requireUserFn, revalidateFn } = vi.hoisted(() => ({
  dbSelectFn: vi.fn(),
  dbUpdateSetFn: vi.fn(),
  requireUserFn: vi.fn(),
  revalidateFn: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserFn
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidateFn
}));

vi.mock("@/lib/invoicing/storage", () => ({
  getDownloadUrl: vi.fn().mockResolvedValue("https://signed-url")
}));

vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: vi.fn(),
  assertClubWriteAccess: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({ limit: () => dbSelectFn() })
          }),
          where: () => ({ limit: () => dbSelectFn() })
        })
      })
    }),
    update: () => ({
      set: (vals: { markedPaidBySponsorAt: Date | null }) => {
        dbUpdateSetFn(vals);
        return { where: () => Promise.resolve() };
      }
    })
  }
}));

import { markInvoicePaidBySponsor } from "@/lib/actions/invoices";

beforeEach(() => {
  dbSelectFn.mockReset();
  dbUpdateSetFn.mockReset();
  requireUserFn.mockReset();
  revalidateFn.mockReset();
});

describe("markInvoicePaidBySponsor", () => {
  it("rejects when invoice does not exist", async () => {
    requireUserFn.mockResolvedValue({ id: "u1", email: "s@x.de" });
    dbSelectFn.mockResolvedValue([]);

    await expect(markInvoicePaidBySponsor("inv-missing")).rejects.toThrow(
      "Rechnung nicht gefunden"
    );
    expect(dbUpdateSetFn).not.toHaveBeenCalled();
  });

  it("rejects when the caller is not the sponsor of the invoice", async () => {
    requireUserFn.mockResolvedValue({ id: "u_intruder", email: "intruder@x.de" });
    dbSelectFn.mockResolvedValue([
      {
        invoice: {
          sponsorId: "sp1",
          markedPaidBySponsorAt: null,
          paidMarkedAt: null
        },
        clubSlug: "fc-test",
        sponsorUserId: "u_real_sponsor"
      }
    ]);

    await expect(markInvoicePaidBySponsor("inv1")).rejects.toThrow(
      /gehört nicht zu deinem/i
    );
    expect(dbUpdateSetFn).not.toHaveBeenCalled();
  });

  it("rejects when the club has already confirmed payment (frozen)", async () => {
    requireUserFn.mockResolvedValue({ id: "u_sponsor", email: "s@x.de" });
    dbSelectFn.mockResolvedValue([
      {
        invoice: {
          sponsorId: "sp1",
          markedPaidBySponsorAt: null,
          paidMarkedAt: new Date("2026-05-10")
        },
        clubSlug: "fc-test",
        sponsorUserId: "u_sponsor"
      }
    ]);

    await expect(markInvoicePaidBySponsor("inv1")).rejects.toThrow(
      /eingefroren/i
    );
    expect(dbUpdateSetFn).not.toHaveBeenCalled();
  });

  it("sets markedPaidBySponsorAt for the legitimate sponsor", async () => {
    requireUserFn.mockResolvedValue({ id: "u_sponsor", email: "s@x.de" });
    dbSelectFn.mockResolvedValue([
      {
        invoice: {
          sponsorId: "sp1",
          markedPaidBySponsorAt: null,
          paidMarkedAt: null
        },
        clubSlug: "fc-test",
        sponsorUserId: "u_sponsor"
      }
    ]);

    const result = await markInvoicePaidBySponsor("inv1");

    expect(dbUpdateSetFn).toHaveBeenCalledOnce();
    const call = dbUpdateSetFn.mock.calls[0][0];
    expect(call.markedPaidBySponsorAt).toBeInstanceOf(Date);
    expect(result.markedPaidBySponsorAt).toBeInstanceOf(Date);
    expect(revalidateFn).toHaveBeenCalledWith("/sponsor/rechnungen");
  });

  it("toggles markedPaidBySponsorAt back to null on second click", async () => {
    requireUserFn.mockResolvedValue({ id: "u_sponsor", email: "s@x.de" });
    dbSelectFn.mockResolvedValue([
      {
        invoice: {
          sponsorId: "sp1",
          markedPaidBySponsorAt: new Date("2026-05-15"),
          paidMarkedAt: null
        },
        clubSlug: "fc-test",
        sponsorUserId: "u_sponsor"
      }
    ]);

    const result = await markInvoicePaidBySponsor("inv1");

    expect(dbUpdateSetFn).toHaveBeenCalledOnce();
    expect(dbUpdateSetFn.mock.calls[0][0].markedPaidBySponsorAt).toBeNull();
    expect(result.markedPaidBySponsorAt).toBeNull();
  });
});
