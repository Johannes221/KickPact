import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db/client";
import { clubs, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  syncAppleSubscriptionForClub,
  getClubIdByOriginalTransactionId,
  getSubscriptionProvider,
  listAppleSubscriptionsForReconcile,
  setAppleStatusForClub,
  getSubscriptionForClub
} from "@/lib/db/queries/subscriptions";

const CLUB_ID = "test_apple_club_1";

beforeEach(async () => {
  await db.delete(subscriptions).where(eq(subscriptions.clubId, CLUB_ID));
  await db.delete(clubs).where(eq(clubs.id, CLUB_ID));
  await db.insert(clubs).values({
    id: CLUB_ID, slug: "apple-test", name: "Apple Test"
  });
  await db.insert(subscriptions).values({ clubId: CLUB_ID, status: "trialing" });
});

describe("syncAppleSubscriptionForClub", () => {
  it("writes provider=apple + identifiers + status", async () => {
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_1",
      status: "active",
      billingCycle: "season_end",
      appleExpiresAt: new Date("2027-01-01")
    });
    const [row] = await db.select().from(subscriptions)
      .where(eq(subscriptions.clubId, CLUB_ID));
    expect(row.provider).toBe("apple");
    expect(row.appleOriginalTransactionId).toBe("apple_otx_1");
    expect(row.status).toBe("active");
    expect(row.billingCycle).toBe("season_end");
  });
});

describe("reverse lookups", () => {
  it("finds the club by original transaction id", async () => {
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_2",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: null
    });
    expect(await getClubIdByOriginalTransactionId("apple_otx_2")).toBe(CLUB_ID);
    expect(await getClubIdByOriginalTransactionId("nope")).toBeNull();
  });

  it("reads the current provider", async () => {
    expect(await getSubscriptionProvider(CLUB_ID)).toBeNull(); // trial, kein Kauf
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_3",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: null
    });
    expect(await getSubscriptionProvider(CLUB_ID)).toBe("apple");
  });
});

describe("listAppleSubscriptionsForReconcile (HIGH-2)", () => {
  const APPLE_PAST = "test_apple_recon_past";
  const APPLE_FUTURE = "test_apple_recon_future";
  const APPLE_NULL = "test_apple_recon_null";
  const STRIPE_ACTIVE = "test_apple_recon_stripe";
  const APPLE_CANCELLED = "test_apple_recon_cancelled";
  const ALL = [APPLE_PAST, APPLE_FUTURE, APPLE_NULL, STRIPE_ACTIVE, APPLE_CANCELLED];

  beforeEach(async () => {
    for (const id of ALL) {
      await db.delete(subscriptions).where(eq(subscriptions.clubId, id));
      await db.delete(clubs).where(eq(clubs.id, id));
    }
    for (const id of ALL) {
      await db.insert(clubs).values({ id, slug: id, name: id });
    }
    // Apple, active, expiry in der Vergangenheit → MUSS erscheinen
    await db.insert(subscriptions).values({
      clubId: APPLE_PAST,
      provider: "apple",
      appleOriginalTransactionId: "otx_past",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: new Date("2020-01-01")
    });
    // Apple, active, expiry weit in der Zukunft → darf NICHT erscheinen (cutoff=now)
    await db.insert(subscriptions).values({
      clubId: APPLE_FUTURE,
      provider: "apple",
      appleOriginalTransactionId: "otx_future",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: new Date("2099-01-01")
    });
    // Apple, past_due, expiry NULL → MUSS erscheinen
    await db.insert(subscriptions).values({
      clubId: APPLE_NULL,
      provider: "apple",
      appleOriginalTransactionId: "otx_null",
      status: "past_due",
      billingCycle: "monthly",
      appleExpiresAt: null
    });
    // Stripe, active → darf NICHT erscheinen (provider != apple)
    await db.insert(subscriptions).values({
      clubId: STRIPE_ACTIVE,
      provider: "stripe",
      stripeSubscriptionId: "sub_recon",
      status: "active",
      billingCycle: "monthly"
    });
    // Apple, cancelled → darf NICHT erscheinen (status nicht in active/past_due)
    await db.insert(subscriptions).values({
      clubId: APPLE_CANCELLED,
      provider: "apple",
      appleOriginalTransactionId: "otx_cancelled",
      status: "cancelled",
      billingCycle: "monthly",
      appleExpiresAt: new Date("2020-01-01")
    });
  });

  it("liefert nur fällige Apple-Abos (active/past_due, expiry past/null)", async () => {
    const rows = await listAppleSubscriptionsForReconcile(new Date());
    const ids = rows.map((r) => r.clubId);
    expect(ids).toContain(APPLE_PAST);
    expect(ids).toContain(APPLE_NULL);
    expect(ids).not.toContain(APPLE_FUTURE);
    expect(ids).not.toContain(STRIPE_ACTIVE);
    expect(ids).not.toContain(APPLE_CANCELLED);
    const past = rows.find((r) => r.clubId === APPLE_PAST);
    expect(past?.originalTransactionId).toBe("otx_past");
  });

  it("setAppleStatusForClub setzt Status+Ablauf, lässt billingCycle/provider unangetastet", async () => {
    const before = await getSubscriptionForClub(APPLE_PAST);
    expect(before?.billingCycle).toBe("monthly");

    await setAppleStatusForClub(APPLE_PAST, "cancelled", new Date("2025-06-01"));

    const after = await getSubscriptionForClub(APPLE_PAST);
    expect(after?.status).toBe("cancelled");
    expect(after?.appleExpiresAt?.getTime()).toBe(new Date("2025-06-01").getTime());
    // NICHT geklobbert:
    expect(after?.billingCycle).toBe("monthly");
    expect(after?.provider).toBe("apple");
    expect(after?.appleOriginalTransactionId).toBe("otx_past");
  });
});
