/**
 * Saison-Pass-Sommerpause: Stripe-Pause-Verhalten (Audit 2026-06-11 / A6).
 *
 * `pause_collection.behavior` muss `keep_as_draft` sein, nicht `void`:
 * mit `void` verfiel die Renewal-Invoice eines Saison-Passes, dessen
 * Anniversary in den Sommer fällt, ersatzlos — der Verein wurde nie
 * weiterberechnet. `keep_as_draft` hält die Invoice als Draft und
 * finalisiert sie beim Resume am 1.8.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clubs, subscriptions, users } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  pauseSeasonPassSubscriptions,
  resumeSeasonPassSubscriptions
} from "@/lib/billing/season-pass";

describe.skipIf(isIntegrationDbDisabled)("pauseSeasonPassSubscriptions (A6)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("pausiert mit behavior=keep_as_draft (Renewal-Invoice bleibt als Draft erhalten)", async () => {
    const db = await getTestDb();
    await db.insert(users).values({ id: "u_sp", email: "sp@example.com" });
    await db.insert(clubs).values({ id: "c_sp", slug: "sp-fc", name: "SP FC" });
    await db.insert(subscriptions).values({
      clubId: "c_sp",
      stripeCustomerId: "cus_sp",
      stripeSubscriptionId: "sub_sp",
      status: "active",
      billingCycle: "season_end"
    });

    const update = vi.fn().mockResolvedValue({ id: "sub_sp" });
    const result = await pauseSeasonPassSubscriptions(
      new Date("2026-06-01T02:00:00Z"),
      { subscriptions: { update } }
    );

    expect(result.paused).toBe(1);
    expect(update).toHaveBeenCalledWith(
      "sub_sp",
      { pause_collection: { behavior: "keep_as_draft" } },
      { idempotencyKey: "season-pass-pause-sub_sp" }
    );
  });

  it("Resume finalisiert liegengebliebene Draft-Invoices (Review-Befund A6)", async () => {
    const db = await getTestDb();
    await db.insert(users).values({ id: "u_sp2", email: "sp2@example.com" });
    await db.insert(clubs).values({ id: "c_sp2", slug: "sp2-fc", name: "SP2 FC" });
    await db.insert(subscriptions).values({
      clubId: "c_sp2",
      stripeCustomerId: "cus_sp2",
      stripeSubscriptionId: "sub_sp2",
      status: "paused",
      billingCycle: "season_end"
    });

    const update = vi.fn().mockResolvedValue({ id: "sub_sp2" });
    const list = vi.fn().mockResolvedValue({ data: [{ id: "in_draft_1" }] });
    const finalizeInvoice = vi.fn().mockResolvedValue({ id: "in_draft_1" });

    const result = await resumeSeasonPassSubscriptions(
      new Date("2026-08-01T02:00:00Z"),
      { subscriptions: { update }, invoices: { list, finalizeInvoice } }
    );

    expect(result.resumed).toBe(1);
    expect(update).toHaveBeenCalledWith(
      "sub_sp2",
      { pause_collection: null },
      { idempotencyKey: "season-pass-resume-sub_sp2" }
    );
    expect(list).toHaveBeenCalledWith({
      subscription: "sub_sp2",
      status: "draft",
      limit: 100
    });
    expect(finalizeInvoice).toHaveBeenCalledWith("in_draft_1");
  });
});
